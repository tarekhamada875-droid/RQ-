/**
 * Routes 3 & 4: POST /api/vehicles/delete (refunds permanently disabled,
 * audit B3). Handler and registration moved verbatim from
 * server/vehicleRoutes.ts (audit Phase 3 file split, 2026-11-19).
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { validateIdempotencyKey, normalizePlateRaw } from '../validation';
import { mapDomainErrorToStatus } from '../routes/helpers';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from '../idempotency';
import { recordDomainEventInTransaction } from '../events';
import { parseMoneyAmount } from '../money';
import { createOperationId, createVehicleDelta, nextOperationVersion } from '../deltaProjection';
import { materializeCreditLedgerEntry, restoreCredits } from '../domain/prepaidCreditLedger';
import { writeMaintainedGarageDelta, writeMaintainedGarageDailyDelta } from '../workerMaintenance';
import { getCairoDateKey } from '../projections';
import { buildActivityLogEntry } from '../activityLogWriter';

export function registerVehicleDelete(app: WorkerApp): void {
// Vehicle correction is deletion-only; refunds are no longer supported.
const VEHICLE_DELETE_REFUND_IDEMPOTENCY_SCOPE = '/api/vehicles/delete-refund';

// Route 3 & 4: POST /api/vehicles/delete & POST /api/vehicles/refund
const handleVehicleDeleteOrRefund = async (c: any) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId: bodyGarageId, vehicleId, refundAmount } = body;
    const callerRole = user?.role;
    let garageId = '';

    if (callerRole === 'garage' || callerRole === 'staff') {
      if (!user?.garageId) {
        return c.json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' }, 403);
      }
      if (bodyGarageId && bodyGarageId !== user.garageId) {
        return c.json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' }, 403);
      }
      garageId = user.garageId;
    } else if (callerRole === 'admin') {
      garageId = bodyGarageId;
    } else {
      return c.json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' }, 403);
    }

    const staffId = user?.uid;

    if (!garageId || !vehicleId) {
      return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    }

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    // Audit B3 (Phase 3, 2026-11-06): refunds are permanently disabled.
    // The early return at line 593 rejects any requestedRefund > 0 with
    // a 410. After that line, requestedRefund is always 0, so all the
    // refund-emitting branches below (refundAmt > 0) were dead code.
    // They've been removed; the operation is always 'delete' and the
    // event type is always 'vehicle_deleted'. The 'vehicle_refunded'
    // event TYPE itself is still alive in events.ts, projections.ts,
    // financialReporting.ts, and domain/garageReconciliation.ts — those
    // process historical refund events from before refunds were disabled
    // and must stay.
    const requestedRefund = refundAmount === undefined || refundAmount === null || refundAmount === '' ? 0 : parseMoneyAmount(refundAmount);
    if (requestedRefund === null) return c.json({ success: false, error: 'INVALID_REFUND_AMOUNT' }, 400);
    if (requestedRefund > 0) return c.json({ success: false, error: 'REFUNDS_NOT_SUPPORTED' }, 410);
    const canonicalVehicleId = normalizePlateRaw(vehicleId) || vehicleId;
    const requestFingerprint = createRequestFingerprint({
      garageId,
      vehicleId: canonicalVehicleId,
      operation: 'delete',
      refundAmount: 0
    });

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(
          t,
          idempotencyKey,
          VEHICLE_DELETE_REFUND_IDEMPOTENCY_SCOPE,
          user?.uid,
          requestFingerprint
        );
        if (duplicate.isDuplicate) return;
      }
      const todayYMD = getCairoDateKey(new Date());
      const operationId = createOperationId(garageId, idempotencyKey || undefined);
      const garageRef = adminDb.doc(`garages/${garageId}`);
      let vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${todayYMD}`);

      let [garageDoc, vehicleDoc, dailyStatsDoc] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!vehicleDoc.exists && canonicalVehicleId !== vehicleId) {
        const altRef = adminDb.doc(`garages/${garageId}/vehicles/${canonicalVehicleId}`);
        const altSnap = await t.get(altRef);
        if (altSnap.exists) {
          vehicleRef = altRef;
          vehicleDoc = altSnap;
        }
      }

      if (!garageDoc.exists) throw new Error('GARAGE_NOT_FOUND');
      if (!vehicleDoc.exists) throw new Error('VEHICLE_NOT_FOUND');

      const garageData = garageDoc.data() || {};
      const vehicleData = vehicleDoc.data() || {};

      const resolvedStaffName = user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));

      if (callerRole !== 'admin') {
        const entrantEntityId = vehicleData.enteredByEntityId;
        const entrantRole = vehicleData.enteredByRole;
        const callerEntityId = user?.entityId;

        // Legacy records without stable entrant metadata are Admin-only; auth UIDs are audit-only.
        if (!callerEntityId || entrantEntityId !== callerEntityId || entrantRole !== callerRole) {
          throw new Error('CORRECTION_FORBIDDEN: Only the account that entered the vehicle can correct or delete it');
        }
      }

      const todayDeletions = garageData.lastDeletionDate === todayYMD ? (garageData.dailyDeletionCount || 0) : 0;
      if (todayDeletions >= 3 && callerRole !== 'admin') {
        throw new Error('reached_daily_deletion_limit');
      }

      // Audit B3: refund-related variables (isSameRefundDay,
      // maxEligibleRefund, refundAmt) removed — refundAmt was always 0
      // after the early return at line 603. The credit-restore path
      // below (for vehicles deleted while still inside) is unrelated to
      // refunds — it restores the credit that was debited at check-in.
      let creditRestore: any = null;
      // Audit fix (2026-11-21): restore the check-in credit ONLY when the
      // vehicle is still inside — i.e. the "wrong entry" correction case the
      // comment below always described. The old condition had no status
      // guard, so deleting an already checked-out vehicle (revenue recorded
      // at check-out, refunds disabled by design) ALSO returned the credit —
      // the garage kept the recorded revenue AND got the credit back.
      if (vehicleData.status === 'inside' && typeof garageData.credits === 'number' && vehicleData.creditDebit && !vehicleData.creditRestoredAt) {
        const restoreResult = restoreCredits({
          balance: Number(garageData.credits ?? 0),
          amount: Number(vehicleData.creditDebit.amount),
          garageId,
          actorUid: user?.uid || staffId || 'system',
          actorRole: callerRole || 'staff',
          reason: 'authorized_vehicle_deletion_refund',
          occurredAt: new Date().toISOString(),
          idempotencyKey: idempotencyKey || operationId,
        });
        if (restoreResult.ok === false) throw new Error(restoreResult.error);
        const materializedRestore = materializeCreditLedgerEntry(restoreResult.value.entry);
        if (materializedRestore.ok === false) throw new Error(materializedRestore.error);
        creditRestore = { ...restoreResult.value, entry: materializedRestore.value };
        t.set(adminDb.doc(`credit_ledger/${materializedRestore.value.entryId}`), materializedRestore.value);
      }

      let enteredToday = false;
      if (vehicleData.status === 'inside' && vehicleData.entryTime) {
        const entryTime = vehicleData.entryTime.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
        if (!isNaN(entryTime.getTime())) {
          const entryDateKey = getCairoDateKey(entryTime);
          enteredToday = entryDateKey === todayYMD;
        }
      }

      t.delete(vehicleRef);

      const updates: any = {
        dailyDeletionCount: todayDeletions + 1,
        lastDeletionDate: todayYMD
      };
      // Audit B3: the `if (refundAmt > 0)` branches that updated
      // dailyRefundCount, lastRefundDate, todayRevenue, and totalRevenue
      // are removed — refundAmt was always 0.
      if (creditRestore) {
        updates.credits = creditRestore.balance;
      }
      if (vehicleData.status === 'inside') updates.carsInside = Math.max(0, (garageData.carsInside || 0) - 1);
      if (enteredToday) updates.todayCount = Math.max(0, (garageData.todayCount || 0) - 1);

      t.set(garageRef, updates, { merge: true });

      if (dailyStatsDoc.exists) {
        const statsUpdates: any = {};
        if (enteredToday) {
          const prevCount = dailyStatsDoc.data()?.count || 0;
          if (prevCount > 0) statsUpdates.count = prevCount - 1;
        }
        // Audit B3: the `if (refundAmt > 0)` branch that updated
        // daily_stats.revenue is removed — refundAmt was always 0.
        if (Object.keys(statsUpdates).length > 0) {
          t.set(dailyStatsRef, statsUpdates, { merge: true });
        }
      }

      const maintainedGarageDelta: Record<string, number> = {};
      if (vehicleData.status === 'inside') maintainedGarageDelta.carsInside = -1;
      writeMaintainedGarageDelta(t, garageId, maintainedGarageDelta, {
        garageId,
        name: garageData.name || '',
        balanceExpiry: garageData.balanceExpiry || null,
        isTrial: Boolean(garageData.isTrial),
        dailyCapacity: Number(garageData.dailyCapacity || 0),
        hourlyRate: Number(garageData.hourlyRate || 0)
      });
      const maintainedDailyDelta: Record<string, number> = {};
      if (enteredToday) maintainedDailyDelta.todayEntries = -1;
      // Audit B3: the `if (refundAmt > 0) maintainedDailyDelta.todayRevenue
      // = -refundAmt` line is removed — refundAmt was always 0.
      writeMaintainedGarageDailyDelta(t, garageId, todayYMD, maintainedDailyDelta);

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, buildActivityLogEntry({
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || vehicleData.staffId || null,
        staffName: resolvedStaffName,
        actionType: 'delete_refund',
        plateNumber: `مسح لوحة: ${vehicleData.plateNumber || vehicleId}`,
        timestamp: new Date(),
        amount: 0,
        ...(creditRestore ? {
          creditAmount: creditRestore.entry.amount,
          creditLedgerEntryId: creditRestore.entry.entryId,
        } : {})
      }));
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: vehicleId,
        // Audit B3: always 'vehicle_deleted' — refunds are disabled.
        // The 'vehicle_refunded' event type is still handled by
        // projections.ts, financialReporting.ts, and
        // domain/garageReconciliation.ts for historical events.
        eventType: 'vehicle_deleted',
        actorUid: user?.uid || staffId || 'system',
        actorRole: callerRole || 'staff',
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber: vehicleData.plateNumber || vehicleId,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          refundAmount: 0,
          accountingDate: todayYMD,
          accountingPolicy: 'refund_on_refund_date',
          originalCheckoutAt: vehicleData.exitTime?.toDate ? vehicleData.exitTime.toDate().toISOString() : (vehicleData.exitTime || null),
          previousStatus: vehicleData.status,
          previousCost: vehicleData.totalCost || 0,
          ...(creditRestore ? {
            creditRestored: creditRestore.entry.amount,
            creditRestoreLedgerEntryId: creditRestore.entry.entryId,
          } : {}),
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleData.operationVersion),
          projectionDelta: createVehicleDelta('vehicle_deleted')
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t,
          idempotencyKey,
          { success: true },
          VEHICLE_DELETE_REFUND_IDEMPOTENCY_SCOPE,
          user?.uid,
          requestFingerprint
        );
      }
    });
    return c.json({ success: true });
  } catch (err: any) {
    console.error('[Worker] Delete/refund error:', err);
    const { statusCode, code, message } = mapDomainErrorToStatus(err);
    const errorResponse = { success: false, error: message, code };
    return c.json(
      err?.message === 'IDEMPOTENCY_KEY_REUSE'
        ? { ...errorResponse, code: 'IDEMPOTENCY_KEY_REUSE' }
        : errorResponse,
      statusCode as any
    );
  }
};

app.post('/api/vehicles/delete', requireWorkerAuth, handleVehicleDeleteOrRefund);
}
