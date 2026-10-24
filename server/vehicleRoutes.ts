import type { WorkerApp } from './cloudflareWorker';
import { lookupSubscriber, safeDateMillis } from './workerReadHelpers';
import type { ProjectionDelta } from './deltaProjection';
import { applyCheckoutReportDelta, emptyDailyReportAggregate } from './reportAggregate';

export type VehicleRouteDependency = (...args: any[]) => any;

export interface VehicleRouteDeps {
  getAdminDb: () => any;
  requireWorkerAuth: VehicleRouteDependency;
  checkIdempotencyInTransaction: VehicleRouteDependency;
  createRequestFingerprint: VehicleRouteDependency;
  storeIdempotencyInTransaction: VehicleRouteDependency;
  recordDomainEventInTransaction: VehicleRouteDependency;
  parseMoneyAmount: VehicleRouteDependency;
  calculateVehicleCost: VehicleRouteDependency;
  validateIdempotencyKey: VehicleRouteDependency;
  validatePlate: VehicleRouteDependency;
  normalizePlateRaw: VehicleRouteDependency;
  mapDomainErrorToStatus: VehicleRouteDependency;
  createOperationId: VehicleRouteDependency;
  createVehicleDelta: VehicleRouteDependency;
  nextOperationVersion: VehicleRouteDependency;
  decideVehicleCheckIn: VehicleRouteDependency;
  garageDocumentToCheckInState: VehicleRouteDependency;
  vehicleDocumentToCheckInState: VehicleRouteDependency;
  decideVehicleCheckOut: VehicleRouteDependency;
  garageDocumentToCheckOutState: VehicleRouteDependency;
  vehicleDocumentToCheckOutState: VehicleRouteDependency;
  authorizeVehicleGarageScope: VehicleRouteDependency;
  debitRegularEntry: VehicleRouteDependency;
  materializeCreditLedgerEntry: VehicleRouteDependency;
  restoreCredits: VehicleRouteDependency;
  writeProjectionBucket: (transaction: any, garageId: string, dateId: string, operationId: string, delta: ProjectionDelta) => void;
  writeMaintainedGarageDelta: VehicleRouteDependency;
  writeMaintainedGarageDailyDelta: VehicleRouteDependency;
}

const SUPPORTED_VEHICLE_TYPES = new Set(['hourly', 'overnight']);

const CAIRO_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function cairoMidnightUtc(dateId: string): Date | null {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(dateId);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) return null;

  const targetLocalAsUtc = Date.UTC(year, month - 1, day);
  let candidate = targetLocalAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      CAIRO_DATE_TIME_FORMATTER.formatToParts(new Date(candidate))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)])
    );
    const displayedLocalAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const correction = targetLocalAsUtc - displayedLocalAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

function cairoDateRange(dateId: string): { start: Date; end: Date } | null {
  const start = cairoMidnightUtc(dateId);
  if (!start) return null;
  const [year, month, day] = dateId.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDateId = [
    nextDate.getUTCFullYear().toString().padStart(4, '0'),
    (nextDate.getUTCMonth() + 1).toString().padStart(2, '0'),
    nextDate.getUTCDate().toString().padStart(2, '0')
  ].join('-');
  const end = cairoMidnightUtc(nextDateId);
  return end && end.getTime() > start.getTime() ? { start, end } : null;
}


export function registerVehicleRoutes(app: WorkerApp, deps: VehicleRouteDeps): void {
  const {
    getAdminDb,
    requireWorkerAuth,
    checkIdempotencyInTransaction,
    createRequestFingerprint,
    storeIdempotencyInTransaction,
    recordDomainEventInTransaction,
    parseMoneyAmount,
    calculateVehicleCost,
    validateIdempotencyKey,
    validatePlate,
    normalizePlateRaw,
    mapDomainErrorToStatus,
    createOperationId,
    createVehicleDelta,
    nextOperationVersion,
    decideVehicleCheckIn,
    garageDocumentToCheckInState,
    vehicleDocumentToCheckInState,
    decideVehicleCheckOut,
    garageDocumentToCheckOutState,
    vehicleDocumentToCheckOutState,
    authorizeVehicleGarageScope,
    debitRegularEntry,
    materializeCreditLedgerEntry,
    restoreCredits,
    writeProjectionBucket,
    writeMaintainedGarageDelta,
    writeMaintainedGarageDailyDelta
  } = deps;
// 7. Vehicle Operations & Operational Flow (CF5)

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
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const requestFingerprint = createRequestFingerprint({ garageId, plateNumber, plateRaw, type: vehicleType });
    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let resultData: Record<string, any> = {};

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-in', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || {};
          return;
        }
      }
      const garageRef = getAdminDb().doc(`garages/${garageId}`);
      const vehicleRef = getAdminDb().doc(`garages/${garageId}/vehicles/${plateRaw}`);
      const dailyStatsRef = getAdminDb().doc(`garages/${garageId}/daily_stats/${today}`);
      const subscriberCollection = getAdminDb().collection(`garages/${garageId}/subscribers`);

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
      const decision = decideVehicleCheckIn(checkInGarage, checkInVehicle);
      if (decision.ok === false) throw new Error(decision.error);
      const { isNewDay, used } = decision.value;
      const prepaidCreditsEnabled = garageData.billingModel === 'prepaid_credits' || garageData.creditBalance !== undefined;
      let creditDebit: any = null;
      if (prepaidCreditsEnabled && !isSubscriberAuthoritative) {
        const creditResult = debitRegularEntry({
          balance: {
            paid: Number(garageData.creditBalance?.paid || 0),
            referral: Number(garageData.creditBalance?.referral || 0),
            trial: Number(garageData.creditBalance?.trial || 0),
          },
          amount: 1,
          garageId,
          actorUid: user?.uid || staffId || 'system',
          actorRole: callerRole || 'staff',
          reason: 'regular_vehicle_entry',
          reference: operationId,
          occurredAt: new Date().toISOString(),
          idempotencyKey: idempotencyKey || operationId,
        });
        if (creditResult.ok === false) throw new Error(creditResult.error);
        const materialized = materializeCreditLedgerEntry(creditResult.value.entry);
        if (materialized.ok === false) throw new Error(materialized.error);
        creditDebit = { ...creditResult.value, entry: materialized.value };
        t.set(getAdminDb().doc(`credit_ledger/${materialized.value.entryId}`), materialized.value);
      }

      t.set(vehicleRef, {
        id: plateRaw,
        plate: plateNumber,
        plateNumber,
        plateNumberRaw: plateRaw,
        type: vehicleType,
        isSubscriber: isSubscriberAuthoritative,
        entryTime: new Date(),
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
            bucket: creditDebit.entry.bucket,
            ledgerEntryId: creditDebit.entry.entryId,
          }
        } : {})
      }, { merge: true });

      const garageUpdate: any = {
        carsInside: (garageData.carsInside || 0) + 1,
        todayCount: isNewDay ? 1 : used + 1,
        todayRevenue: isNewDay ? 0 : (garageData.todayRevenue || 0),
        lastTransactionDate: today
      };
      if (creditDebit) {
        garageUpdate.creditBalance = creditDebit.balance;
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

      const logRef = getAdminDb().collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || null,
        staffName: resolvedStaffName,
        actionType: 'check_in',
        plateNumber,
        timestamp: new Date(),
        amount: 0
      });

      resultData = {
        isSubscriber: isSubscriberAuthoritative,
        vehicle: {
          id: plateRaw,
          plateNumber,
          plateNumberRaw: plateRaw,
          type: vehicleType,
          status: 'inside',
          entryTime: new Date().toISOString(),
          staffId: entrantEntityId || null,
          staffName: resolvedStaffName,
          enteredByUid: user?.uid || null,
          enteredByEntityId: entrantEntityId || null,
          enteredByRole: callerRole || null,
          isSubscriber: isSubscriberAuthoritative
        },
        carsInside: Number(garageUpdate.carsInside || 0),
        dailyCount: Number(garageUpdate.todayCount || 0),
        dailyCapacity: 0
      };
      if (creditDebit) {
        resultData.creditBalance = creditDebit.balance;
        resultData.remainingCredits = creditDebit.balance.paid + creditDebit.balance.referral + creditDebit.balance.trial;
        resultData.creditDebit = {
          amount: creditDebit.entry.amount,
          bucket: creditDebit.entry.bucket,
          ledgerEntryId: creditDebit.entry.entryId,
        };
      }

      recordDomainEventInTransaction(t, getAdminDb(), {
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
            creditBucket: creditDebit.entry.bucket,
            creditLedgerEntryId: creditDebit.entry.entryId,
          } : {}),
          projectionDelta: createVehicleDelta('vehicle_entered')
        }
      });
      writeProjectionBucket(t, garageId, today, operationId, createVehicleDelta('vehicle_entered'));

      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/vehicles/check-in', user?.uid, requestFingerprint);
      }
    });

    const durationMs = Date.now() - requestStartedAt;
    c.header('Server-Timing', `check-in;dur=${durationMs}`);
    return c.json({ success: true, data: resultData });
  } catch (err: any) {
    console.error('[Worker] Check-in error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

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
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestFingerprint = createRequestFingerprint({ garageId, vehicleId });

    const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let finalCost = 0;

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-out', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          finalCost = Number(duplicate.cachedResult?.cost || 0);
          return;
        }
      }
      const canonicalVehicleId = normalizePlateRaw(vehicleId) || vehicleId;
      const garageRef = getAdminDb().doc(`garages/${garageId}`);
      let vehicleRef = getAdminDb().doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const today = getCairoDateKey();
      const dailyStatsRef = getAdminDb().doc(`garages/${garageId}/daily_stats/${today}`);

      let [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!vehicleSnap.exists && canonicalVehicleId !== vehicleId) {
        const altRef = getAdminDb().doc(`garages/${garageId}/vehicles/${canonicalVehicleId}`);
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

      const cost = calculateVehicleCost(vehicleData, garageData);
      const decision = decideVehicleCheckOut({ today, cost }, checkOutGarage, checkOutVehicle);
      if (decision.ok === false) throw new Error(decision.error);
      const { cost: finalDecisionCost, isNewDay } = decision.value;
      finalCost = finalDecisionCost;

      t.set(vehicleRef, {
        status: 'outside',
        exitTime: new Date(),
        totalCost: finalDecisionCost,
        operationId,
        operationVersion: nextOperationVersion(vehicleData.operationVersion)
      }, { merge: true });

      t.set(garageRef, {
        totalRevenue: (garageData.totalRevenue || 0) + finalDecisionCost,
        totalVehiclesOut: (garageData.totalVehiclesOut || 0) + 1,
        todayRevenue: isNewDay ? finalDecisionCost : (garageData.todayRevenue || 0) + finalDecisionCost,
        todayCount: isNewDay ? 0 : (garageData.todayCount || 0),
        lastTransactionDate: today,
        carsInside: Math.max(0, (garageData.carsInside || 0) - 1)
      }, { merge: true });

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
          revenue: (dailyStatsData.revenue || 0) + finalDecisionCost,
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

      const logRef = getAdminDb().collection('activity_logs').doc();
      t.set(logRef, {
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
      });
      recordDomainEventInTransaction(t, getAdminDb(), {
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
      writeProjectionBucket(t, garageId, today, operationId, createVehicleDelta('vehicle_exited', finalDecisionCost));
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { cost: finalDecisionCost }, '/api/vehicles/check-out', user?.uid, requestFingerprint);
      }
    });

    return c.json({ success: true, data: { cost: finalCost } });
  } catch (err: any) {
    console.error('[Worker] Check-out error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Both aliases share one retry namespace; the fingerprint distinguishes the requested delete/refund operation.
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
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestedRefund = refundAmount === undefined || refundAmount === null || refundAmount === ''
      ? 0
      : parseMoneyAmount(refundAmount);
    if (requestedRefund === null) {
      return c.json({ success: false, error: 'INVALID_REFUND_AMOUNT' }, 400);
    }
    const operation = requestedRefund > 0 ? 'refund' : 'delete';
    const canonicalVehicleId = normalizePlateRaw(vehicleId) || vehicleId;
    const requestFingerprint = createRequestFingerprint({
      garageId,
      vehicleId: canonicalVehicleId,
      operation,
      refundAmount: requestedRefund
    });
    const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    await getAdminDb().runTransaction(async (t: any) => {
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
      const todayYMD = getCairoDateKey();
      const operationId = createOperationId(garageId, idempotencyKey || undefined);
      const garageRef = getAdminDb().doc(`garages/${garageId}`);
      let vehicleRef = getAdminDb().doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const dailyStatsRef = getAdminDb().doc(`garages/${garageId}/daily_stats/${todayYMD}`);

      let [garageDoc, vehicleDoc, dailyStatsDoc] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!vehicleDoc.exists && canonicalVehicleId !== vehicleId) {
        const altRef = getAdminDb().doc(`garages/${garageId}/vehicles/${canonicalVehicleId}`);
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

      const isSameRefundDay = garageData.lastRefundDate === todayYMD;
      const maxEligibleRefund = vehicleData.status === 'outside'
        ? parseMoneyAmount(vehicleData.totalCost) ?? 0
        : 0;
      const refundAmt = Math.min(requestedRefund, maxEligibleRefund);
      let creditRestore: any = null;
      if (garageData.creditBalance !== undefined && vehicleData.creditDebit && !vehicleData.creditRestoredAt) {
        const restoreResult = restoreCredits({
          balance: {
            paid: Number(garageData.creditBalance?.paid || 0),
            referral: Number(garageData.creditBalance?.referral || 0),
            trial: Number(garageData.creditBalance?.trial || 0),
          },
          amount: Number(vehicleData.creditDebit.amount),
          bucket: vehicleData.creditDebit.bucket,
          garageId,
          actorUid: user?.uid || staffId || 'system',
          actorRole: callerRole || 'staff',
          reason: 'authorized_vehicle_deletion_refund',
          reference: operationId,
          occurredAt: new Date().toISOString(),
          idempotencyKey: idempotencyKey || operationId,
        });
        if (restoreResult.ok === false) throw new Error(restoreResult.error);
        const materializedRestore = materializeCreditLedgerEntry(restoreResult.value.entry);
        if (materializedRestore.ok === false) throw new Error(materializedRestore.error);
        creditRestore = { ...restoreResult.value, entry: materializedRestore.value };
        t.set(getAdminDb().doc(`credit_ledger/${materializedRestore.value.entryId}`), materializedRestore.value);
      }

      let enteredToday = false;
      if (vehicleData.status === 'inside' && vehicleData.entryTime) {
        const entryTime = vehicleData.entryTime.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
        if (!isNaN(entryTime.getTime())) {
          const entryDateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(entryTime);
          enteredToday = entryDateKey === todayYMD;
        }
      }

      t.delete(vehicleRef);

      const updates: any = {
        dailyDeletionCount: todayDeletions + 1,
        lastDeletionDate: todayYMD
      };
      if (refundAmt > 0) {
        updates.dailyRefundCount = isSameRefundDay ? ((garageData.dailyRefundCount || 0) + 1) : 1;
        updates.lastRefundDate = todayYMD;
      }

      if (refundAmt > 0) {
        updates.todayRevenue = Math.max(0, Number(((garageData.todayRevenue || 0) - refundAmt).toFixed(2)));
        updates.totalRevenue = Math.max(0, Number(((garageData.totalRevenue || 0) - refundAmt).toFixed(2)));
      }
      if (creditRestore) {
        updates.creditBalance = creditRestore.balance;
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
        if (refundAmt > 0) {
          const prevRev = dailyStatsDoc.data()?.revenue || 0;
          statsUpdates.revenue = Math.max(0, Number((prevRev - refundAmt).toFixed(2)));
        }
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
      if (refundAmt > 0) maintainedDailyDelta.todayRevenue = -refundAmt;
      writeMaintainedGarageDailyDelta(t, garageId, todayYMD, maintainedDailyDelta);

      const logRef = getAdminDb().collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || vehicleData.staffId || null,
        staffName: resolvedStaffName,
        actionType: 'delete_refund',
        plateNumber: `مسح لوحة: ${vehicleData.plateNumber || vehicleId}`,
        timestamp: new Date(),
        amount: refundAmt,
        ...(creditRestore ? {
          creditAmount: creditRestore.entry.amount,
          creditBucket: creditRestore.entry.bucket,
          creditLedgerEntryId: creditRestore.entry.entryId,
        } : {})
      });
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: vehicleId,
        eventType: refundAmt > 0 ? 'vehicle_refunded' : 'vehicle_deleted',
        actorUid: user?.uid || staffId || 'system',
        actorRole: callerRole || 'staff',
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber: vehicleData.plateNumber || vehicleId,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          refundAmount: refundAmt,
          accountingDate: todayYMD,
          accountingPolicy: 'refund_on_refund_date',
          originalCheckoutAt: vehicleData.exitTime?.toDate ? vehicleData.exitTime.toDate().toISOString() : (vehicleData.exitTime || null),
          previousStatus: vehicleData.status,
          previousCost: vehicleData.totalCost || 0,
          ...(creditRestore ? {
            creditRestored: creditRestore.entry.amount,
            creditRestoreBucket: creditRestore.entry.bucket,
            creditRestoreLedgerEntryId: creditRestore.entry.entryId,
          } : {}),
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleData.operationVersion),
          projectionDelta: refundAmt > 0 ? createVehicleDelta('vehicle_refunded', refundAmt) : createVehicleDelta('vehicle_deleted')
        }
      });
      writeProjectionBucket(t, garageId, todayYMD, operationId, refundAmt > 0 ? createVehicleDelta('vehicle_refunded', refundAmt) : createVehicleDelta('vehicle_deleted'));
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
    const { statusCode, message } = mapDomainErrorToStatus(err);
    const errorResponse = { success: false, error: message };
    return c.json(
      err?.message === 'IDEMPOTENCY_KEY_REUSE'
        ? { ...errorResponse, code: 'IDEMPOTENCY_KEY_REUSE' }
        : errorResponse,
      statusCode as any
    );
  }
};

app.post('/api/vehicles/delete', requireWorkerAuth, handleVehicleDeleteOrRefund);
app.post('/api/vehicles/refund', requireWorkerAuth, handleVehicleDeleteOrRefund);

// Route 5: GET /api/vehicles/inside
app.get('/api/vehicles/inside', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const garageId = c.req.query('garageId') || user?.garageId || (user?.role === 'garage' ? user?.entityId : null);

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }
    const isAdmin = user?.role === 'admin';
    const isGarageScoped = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);

    if (!isAdmin && !isGarageScoped) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const snap = await getAdminDb().collection(`garages/${garageId}/vehicles`)
      .where('status', '==', 'inside')
      .get();

    const vehicles = snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => safeDateMillis(b.entryTime) - safeDateMillis(a.entryTime));

    return c.json({
      success: true,
      vehicles,
      count: vehicles.length
    });
  } catch (err: any) {
    console.error('[Worker] Error listing inside vehicles:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 6: GET /api/vehicles/history
app.get('/api/vehicles/history', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const garageId = c.req.query('garageId') || user?.garageId || (user?.role === 'garage' ? user?.entityId : null);

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }
    const isAdmin = user?.role === 'admin';
    const isGarageScoped = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);

    if (!isAdmin && !isGarageScoped) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const dateQuery = c.req.query('date') || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const dateRange = cairoDateRange(dateQuery);
    if (!dateRange) return c.json({ success: false, error: 'INVALID_DATE' }, 400);
    const limitQuery = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));

    const snap = await getAdminDb().collection('activity_logs')
      .where('garageId', '==', garageId)
      .where('timestamp', '>=', dateRange.start)
      .where('timestamp', '<', dateRange.end)
      .orderBy('timestamp', 'desc')
      .limit(limitQuery)
      .get();

    const logs = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return c.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (err: any) {
    console.error('[Worker] Error fetching vehicle history:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

}
