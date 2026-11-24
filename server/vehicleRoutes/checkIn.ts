/**
 * Route 1: POST /api/vehicles/check-in.
 *
 * Body moved verbatim from server/vehicleRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { validateIdempotencyKey, validatePlate, parsePlausibleClientTime } from '../validation';
import { mapDomainErrorToStatus } from '../routes/helpers';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from '../idempotency';
import { recordDomainEventInTransaction } from '../events';
import { createOperationId, createVehicleDelta, nextOperationVersion } from '../deltaProjection';
import { decideVehicleCheckIn } from '../domain/vehicleCheckIn';
import { garageDocumentToCheckInState, vehicleDocumentToCheckInState } from '../adapters/vehicleCheckInAdapter';
import { authorizeVehicleGarageScope } from '../domain/authorization';
import { debitRegularEntry, materializeCreditLedgerEntry } from '../domain/prepaidCreditLedger';
import { writeMaintainedGarageDelta, writeMaintainedGarageDailyDelta } from '../workerMaintenance';
import { lookupSubscriber } from '../workerReadHelpers';
import { getCairoDateKey } from '../projections';
import { emptyDailyReportAggregate } from '../reportAggregate';

const SUPPORTED_VEHICLE_TYPES = new Set(['hourly', 'overnight']);

export function registerVehicleCheckIn(app: WorkerApp): void {
// Route 1: POST /api/vehicles/check-in
app.post('/api/vehicles/check-in', requireWorkerAuth, async (c) => {
  const requestStartedAt = Date.now();
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId: bodyGarageId, plateNumber: rawPlateNumber, plateRaw: rawPlateRaw } = body;
    const vehicleType = body.type === undefined ? 'hourly' : body.type;
    if (typeof vehicleType !== 'string' || !SUPPORTED_VEHICLE_TYPES.has(vehicleType)) {
      return c.json({ success: false, error: 'INVALID_VEHICLE_TYPE' }, 400);
    }
    const normalizedPlate = validatePlate(rawPlateNumber || rawPlateRaw);
    const plateNumber = normalizedPlate.plateNumber;
    const plateRaw = normalizedPlate.plateRaw;
    const callerRole = user?.role;
    const scope = authorizeVehicleGarageScope(user, bodyGarageId);
    if (scope.allowed === false) {
      if (scope.reason === 'garage_id_missing') {
        return c.json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' }, 403);
      }
      if (scope.reason === 'garage_scope_mismatch') {
        return c.json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' }, 403);
      }
      return c.json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' }, 403);
    }
    const garageId = scope.garageId as string;
    const staffId = user?.uid;

    if (!garageId || !plateNumber || !plateRaw) {
      return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    }
    const entrantEntityId = user?.entityId;
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));

    // OFFLINE STEP 3 (2026-11-24, owner debug file rq-debug-2026-11-24): an
    // offline envelope can reach the bank hours after the real tap. The
    // vehicle must be stamped with the TRUE entry tap time — it drives the
    // hourly/overnight fee at check-out. The server clock is the fallback
    // only for live traffic, legacy envelopes and implausible clocks.
    const entryAt = parsePlausibleClientTime(body.entryTimeIso, requestStartedAt) ?? new Date();

    const today = getCairoDateKey(new Date());
    const requestFingerprint = createRequestFingerprint({ garageId, plateNumber, plateRaw, type: vehicleType });
    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let resultData: Record<string, any> = {};

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-in', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || {};
          return;
        }
      }
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${plateRaw}`);
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);
      const subscriberCollection = adminDb.collection(`garages/${garageId}/subscribers`);

      let isSubscriberAuthoritative = false;
      try {
        const subscriber = await lookupSubscriber(subscriberCollection, { plateRaw, plateNumber }, (target) => t.get(target));
        const startDate = subscriber?.startDate || '';
        const endDate = subscriber?.endDate || '';
        isSubscriberAuthoritative = Boolean(startDate && endDate && today >= startDate && today <= endDate);
      } catch (subErr) {
        console.warn('[Worker Check-In] Subscriber lookup failed inside transaction:', subErr);
        throw new Error('SUBSCRIBER_LOOKUP_UNAVAILABLE', { cause: subErr });
      }

      const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garageData = garageSnap.data() || {};

      const resolvedStaffName = user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? 'مدير الجراج' : 'موظف'));
      const checkInGarage = garageDocumentToCheckInState(garageData, isSubscriberAuthoritative);
      const checkInVehicle = vehicleDocumentToCheckInState(vehicleSnap.exists ? vehicleSnap.data() || {} : null);
      const decision = decideVehicleCheckIn({ today }, checkInGarage, checkInVehicle);
      if (decision.ok === false) {
        throw new Error(decision.error);
      }
      const { isNewDay } = decision.value;
      const prepaidCreditsEnabled = garageData.billingModel === 'prepaid_credits' || typeof garageData.credits === 'number';
      let creditDebit: any = null;
      if (prepaidCreditsEnabled && !isSubscriberAuthoritative) {
        const creditResult = debitRegularEntry({
          balance: Number(garageData.credits ?? 0),
          amount: 1,
          garageId,
          actorUid: user?.uid || staffId || 'system',
          actorRole: callerRole || 'staff',
          reason: 'regular_vehicle_entry',
          occurredAt: new Date().toISOString(),
          idempotencyKey: idempotencyKey || operationId,
        });
        if (creditResult.ok === false) throw new Error(creditResult.error);
        const materialized = materializeCreditLedgerEntry(creditResult.value.entry);
        if (materialized.ok === false) throw new Error(materialized.error);
        creditDebit = { ...creditResult.value, entry: materialized.value };
        t.set(adminDb.doc(`credit_ledger/${materialized.value.entryId}`), materialized.value);
      }

      t.set(vehicleRef, {
        id: plateRaw,
        plate: plateNumber,
        plateNumber,
        plateNumberRaw: plateRaw,
        type: vehicleType,
        isSubscriber: isSubscriberAuthoritative,
        entryTime: entryAt,
        status: 'inside',
        staffId: entrantEntityId || null,
        staffName: resolvedStaffName,
        enteredByUid: user?.uid || null,
        enteredByEntityId: entrantEntityId || null,
        enteredByRole: callerRole || null,
        operationId,
        operationVersion: nextOperationVersion(vehicleSnap.data()?.operationVersion),
        ...(creditDebit ? {
          creditDebit: {
            amount: creditDebit.entry.amount,
            ledgerEntryId: creditDebit.entry.entryId,
          }
        } : {})
      }, { merge: true });

      const garageUpdate: any = {
        carsInside: (garageData.carsInside || 0) + 1,
        todayCount: isNewDay ? 1 : (garageData.todayCount || 0) + 1,
        todayRevenue: isNewDay ? 0 : (garageData.todayRevenue || 0),
        lastTransactionDate: today
      };
      if (creditDebit) {
        garageUpdate.credits = creditDebit.balance;
      }

      t.set(garageRef, garageUpdate, { merge: true });

      if (!dailyStatsSnap.exists) {
        t.set(dailyStatsRef, {
          dateId: today,
          count: 1,
          limit: 0,
          revenue: 0,
          reportAggregateVersion: 1,
          report: emptyDailyReportAggregate(),
          createdAt: new Date()
        });
      } else {
        t.set(dailyStatsRef, { count: (dailyStatsSnap.data()?.count || 0) + 1 }, { merge: true });
      }

      writeMaintainedGarageDelta(t, garageId, { carsInside: 1 }, {
        garageId,
        name: garageData.name || '',
        balanceExpiry: garageData.balanceExpiry || null,
        isTrial: Boolean(garageData.isTrial),
        dailyCapacity: Number(garageData.dailyCapacity || 0),
        hourlyRate: Number(garageData.hourlyRate || 0)
      });
      writeMaintainedGarageDailyDelta(t, garageId, today, { todayEntries: 1 });

      // No activity_logs write for check-in — the domain event (vehicle_entered)
      // already carries the same data, and no hot-path reader consumes check_in
      // activity logs. This saves 1 write per check-in (~20,000/day at scale).
      // The garage dashboard's "today transactions" reads check_out logs only.

      resultData = {
        isSubscriber: isSubscriberAuthoritative,
        vehicle: {
          id: plateRaw,
          plateNumber,
          plateNumberRaw: plateRaw,
          type: vehicleType,
          status: 'inside',
          entryTime: entryAt.toISOString(),
          staffId: entrantEntityId || null,
          staffName: resolvedStaffName,
          enteredByUid: user?.uid || null,
          enteredByEntityId: entrantEntityId || null,
          enteredByRole: callerRole || null,
          isSubscriber: isSubscriberAuthoritative
        },
        carsInside: Number(garageUpdate.carsInside || 0),
        dailyCount: Number(garageUpdate.todayCount || 0),
        lastTransactionDate: today,
        dailyCapacity: 0
      };
      if (creditDebit) {
        resultData.credits = creditDebit.balance;
        resultData.remainingCredits = creditDebit.balance;
        resultData.creditDebit = {
          amount: creditDebit.entry.amount,
          ledgerEntryId: creditDebit.entry.entryId,
        };
      }

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: plateRaw,
        eventType: 'vehicle_entered',
        actorUid: user?.uid || staffId || 'system',
        actorRole: callerRole || 'staff',
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber,
          plateNumberRaw: plateRaw,
          type: vehicleType,
          isSubscriber: isSubscriberAuthoritative,
          staffId: entrantEntityId || null,
          staffName: resolvedStaffName,
          enteredByEntityId: entrantEntityId || null,
          enteredByRole: callerRole || null,
          operationId,
          operationVersion: nextOperationVersion(vehicleSnap.data()?.operationVersion),
          ...(creditDebit ? {
            creditAmount: creditDebit.entry.amount,
            creditLedgerEntryId: creditDebit.entry.entryId,
          } : {}),
          projectionDelta: createVehicleDelta('vehicle_entered')
        }
      });

      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/vehicles/check-in', user?.uid, requestFingerprint);
      }
    });

    const durationMs = Date.now() - requestStartedAt;
    c.header('Server-Timing', `check-in;dur=${durationMs}`);
    return c.json({ success: true, data: resultData });
  } catch (err: any) {
    console.error('[Worker] Check-in error:', err);
    // The machine code MUST ride on the body: phones classify the bank's
    // answer by it (envelope flush answer classes). Owner debug file
    // 2026-11-24 13:16 — a 409 duplicate without `code` arrived as
    // errorCode:null and the phone misfiled it as retryable.
    const { statusCode, code, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message, code }, statusCode as any);
  }
});
}
