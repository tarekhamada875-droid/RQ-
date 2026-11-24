/**
 * Route 2: POST /api/vehicles/check-out.
 *
 * Body moved verbatim from server/vehicleRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { validateIdempotencyKey, normalizePlateRaw, parsePlausibleClientTime } from '../validation';
import { mapDomainErrorToStatus } from '../routes/helpers';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from '../idempotency';
import { recordDomainEventInTransaction } from '../events';
import { calculateVehicleCost } from '../domain/vehicleCost';
import { createOperationId, createVehicleDelta, nextOperationVersion } from '../deltaProjection';
import { decideVehicleCheckOut } from '../domain/vehicleCheckOut';
import { garageDocumentToCheckOutState, vehicleDocumentToCheckOutState } from '../adapters/vehicleCheckOutAdapter';
import { authorizeVehicleGarageScope } from '../domain/authorization';
import { writeMaintainedGarageDelta, writeMaintainedGarageDailyDelta } from '../workerMaintenance';
import { getCairoDateKey } from '../projections';
import { buildActivityLogEntry } from '../activityLogWriter';
import { addMoneyRounded } from '../money';
import { applyCheckoutReportDelta } from '../reportAggregate';

export function registerVehicleCheckOut(app: WorkerApp): void {
// Route 2: POST /api/vehicles/check-out
app.post('/api/vehicles/check-out', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId: bodyGarageId, vehicleId } = body;
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

    if (!garageId || !vehicleId) {
      return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    }
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestFingerprint = createRequestFingerprint({ garageId, vehicleId });

    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let checkoutResult: any = { cost: 0 };

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-out', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          checkoutResult = duplicate.cachedResult || { cost: 0 };
          return;
        }
      }
      const canonicalVehicleId = normalizePlateRaw(vehicleId) || vehicleId;
      const garageRef = adminDb.doc(`garages/${garageId}`);
      let vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const today = getCairoDateKey(new Date());
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);

      let [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!vehicleSnap.exists && canonicalVehicleId !== vehicleId) {
        const altRef = adminDb.doc(`garages/${garageId}/vehicles/${canonicalVehicleId}`);
        const altSnap = await t.get(altRef);
        if (altSnap.exists) {
          vehicleRef = altRef;
          vehicleSnap = altSnap;
        }
      }

      const garageData = garageSnap.exists ? garageSnap.data() || {} : {};
      const vehicleData = vehicleSnap.exists ? vehicleSnap.data() || {} : {};
      const checkOutGarage = garageDocumentToCheckOutState(garageSnap.exists ? garageData : null);
      const checkOutVehicle = vehicleDocumentToCheckOutState(vehicleSnap.exists ? vehicleData : null);
      const preflight = decideVehicleCheckOut({ today, cost: 0 }, checkOutGarage, checkOutVehicle);
      if (preflight.ok === false) throw new Error(preflight.error);

      const resolvedStaffName = user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? 'مدير الجراج' : 'موظف'));

      // OFFLINE STEP 3 (2026-11-24, owner debug file rq-debug-2026-11-24):
      // bill from the true exit tap time. A checkout envelope can sit in the
      // offline drawer for hours — billing from the flush moment would charge
      // the drawer wait to the customer. Falls back to the server clock when
      // the client time is implausible or would end the stay before it began.
      const exitCandidate = parsePlausibleClientTime(body.exitTimeIso, Date.now()) ?? new Date();
      const entryMs = vehicleData.entryTime?.toDate
        ? (vehicleData.entryTime.toDate() as Date).getTime()
        : (vehicleData.entryTime ? new Date(vehicleData.entryTime as any).getTime() : NaN);
      const exitAt = Number.isFinite(entryMs) && exitCandidate.getTime() >= entryMs
        ? exitCandidate
        : new Date();

      const cost = calculateVehicleCost(vehicleData, garageData, exitAt.getTime());
      const decision = decideVehicleCheckOut({ today, cost }, checkOutGarage, checkOutVehicle);
      if (decision.ok === false) throw new Error(decision.error);
      const { cost: finalDecisionCost, isNewDay } = decision.value;

      t.set(vehicleRef, {
        status: 'outside',
        exitTime: exitAt,
        totalCost: finalDecisionCost,
        operationId,
        operationVersion: nextOperationVersion(vehicleData.operationVersion)
      }, { merge: true });

      const updatedGarageState = {
        totalRevenue: addMoneyRounded(garageData.totalRevenue, finalDecisionCost),
        totalVehiclesOut: (garageData.totalVehiclesOut || 0) + 1,
        todayRevenue: isNewDay ? finalDecisionCost : addMoneyRounded(garageData.todayRevenue, finalDecisionCost),
        todayCount: isNewDay ? 0 : (garageData.todayCount || 0),
        lastTransactionDate: today,
        carsInside: Math.max(0, (garageData.carsInside || 0) - 1)
      };
      t.set(garageRef, updatedGarageState, { merge: true });
      checkoutResult = { cost: finalDecisionCost, ...updatedGarageState };

      if (!dailyStatsSnap.exists) {
        t.set(dailyStatsRef, {
          dateId: today,
          count: 0,
          revenue: finalDecisionCost,
          reportAggregateVersion: 1,
          report: applyCheckoutReportDelta(undefined, {
            type: vehicleData.type || 'hourly',
            amount: finalDecisionCost,
            staffName: resolvedStaffName
          }),
          createdAt: new Date()
        });
      } else {
        const dailyStatsData = dailyStatsSnap.data() || {};
        const reportUpdate = dailyStatsData.reportAggregateVersion === 1
          ? {
              reportAggregateVersion: 1,
              report: applyCheckoutReportDelta(dailyStatsData.report, {
                type: vehicleData.type || 'hourly',
                amount: finalDecisionCost,
                staffName: resolvedStaffName
              })
            }
          : {};
        t.set(dailyStatsRef, {
          revenue: addMoneyRounded(dailyStatsData.revenue, finalDecisionCost),
          ...reportUpdate
        }, { merge: true });
      }

      writeMaintainedGarageDelta(t, garageId, { carsInside: -1 }, {
        garageId,
        name: garageData.name || '',
        balanceExpiry: garageData.balanceExpiry || null,
        isTrial: Boolean(garageData.isTrial),
        dailyCapacity: Number(garageData.dailyCapacity || 0),
        hourlyRate: Number(garageData.hourlyRate || 0)
      });
      writeMaintainedGarageDailyDelta(t, garageId, today, { todayRevenue: finalDecisionCost, todayExits: 1 });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, buildActivityLogEntry({
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || null,
        staffName: resolvedStaffName,
        actionType: 'check_out',
        plateNumber: vehicleData.plateNumber,
        plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
        entryTime: vehicleData.entryTime,
        type: vehicleData.type || 'hourly',
        isSubscriber: !!vehicleData.isSubscriber,
        timestamp: new Date(),
        amount: finalDecisionCost
      }));
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: vehicleId,
        eventType: 'vehicle_exited',
        actorUid: user?.uid || staffId || 'system',
        actorRole: callerRole || 'staff',
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber: vehicleData.plateNumber || vehicleId,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          type: vehicleData.type || 'hourly',
          isSubscriber: !!vehicleData.isSubscriber,
          cost: finalDecisionCost,
          entryTime: vehicleData.entryTime,
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleData.operationVersion),
          projectionDelta: createVehicleDelta('vehicle_exited', finalDecisionCost)
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, checkoutResult, '/api/vehicles/check-out', user?.uid, requestFingerprint);
      }
    });

    return c.json({ success: true, data: checkoutResult });
  } catch (err: any) {
    console.error('[Worker] Check-out error:', err);
    // The machine code MUST ride on the body: phones classify the bank's
    // answer by it (envelope flush answer classes). Owner debug file
    // 2026-11-24 13:16 — a 409 duplicate without `code` arrived as
    // errorCode:null and the phone misfiled it as retryable.
    const { statusCode, code, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message, code }, statusCode as any);
  }
});
}
