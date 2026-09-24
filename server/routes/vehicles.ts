import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, AuthRequest } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from '../idempotency';
import { recordDomainEventInTransaction } from '../events';
import { evaluateFairUseCheckIn } from '../unlimitedFairUse';
import { calculateVehicleCost } from '../utils';
import { validateIdempotencyKey, validatePlate } from '../validation';
import { mapDomainErrorToStatus } from './helpers';
import { createOperationId, createVehicleDelta, nextOperationVersion, projectionBucketPath, projectionBucketUpdate, projectionShardCount, ProjectionDelta } from '../deltaProjection';
import { decideVehicleCheckIn } from '../domain/vehicleCheckIn';
import { fairUseResultToDecision, garageDocumentToCheckInState, vehicleDocumentToCheckInState } from '../adapters/vehicleCheckInAdapter';

const router = Router();

export function isGarageDeletionActive(garageData: Record<string, any>): boolean {
  return garageData?.isDeleting === true;
}

function writeProjectionBucket(transaction: any, garageId: string, dateId: string, operationId: string, delta: ProjectionDelta): void {
  if (!adminDb || Object.keys(delta).length === 0) return;
  const configuredRate = Number(process.env.PROJECTION_OPERATIONS_PER_SECOND || 1);
  const shardCount = projectionShardCount(Number.isFinite(configuredRate) ? configuredRate : 1);
  const bucket = projectionBucketUpdate(operationId, dateId, delta, shardCount);
  const bucketRef = adminDb.doc(projectionBucketPath(garageId, dateId, operationId, shardCount));
  const increments = Object.fromEntries(Object.entries(delta).map(([field, value]) => [field, FieldValue.increment(Number(value || 0))]));
  transaction.set(bucketRef, { ...increments, operationId: bucket.operationId, projectionVersion: bucket.projectionVersion, dateId: bucket.dateId, shard: bucket.shard, updatedAt: new Date() }, { merge: true });
}

// Secure Server API: Vehicle Check-In
router.post('/check-in', requireAuth, async (req: AuthRequest, res: any) => {
  const requestStartedAt = Date.now();
  try {
    const { garageId: bodyGarageId, plateNumber: rawPlateNumber, plateRaw: rawPlateRaw, type } = req.body || {};
    const normalizedPlate = validatePlate(rawPlateNumber || rawPlateRaw);
    const plateNumber = normalizedPlate.plateNumber;
    const plateRaw = normalizedPlate.plateRaw;
    const callerRole = req.user?.role;
    let garageId = '';

    if (callerRole === 'garage' || callerRole === 'staff') {
      if (!req.user?.garageId) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' });
      }
      if (bodyGarageId && bodyGarageId !== req.user.garageId) {
        return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
      }
      garageId = req.user.garageId;
    } else if (callerRole === 'admin') {
      garageId = bodyGarageId;
    } else {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' });
    }

    const staffId = req.user?.uid;
    
    if (!garageId || !plateNumber || !plateRaw) {
      return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
    }
    if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);

    const getCairoDateKey = () => {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    };

    const today = getCairoDateKey();
    const requestFingerprint = createRequestFingerprint({ garageId, plateNumber, plateRaw, type: type || 'hourly' });
    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let resultData: Record<string, any> = {};
    let isSubscriberAuthoritative = false;
    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-in', req.user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || {};
          return;
        }
      }
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${plateRaw}`);
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);

      const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garageData = garageSnap.data() || {};

      isSubscriberAuthoritative = false;
      try {
        const subscriberCollection = adminDb.collection(`garages/${garageId}/subscribers`);
        const [subSnapRaw, subSnapPlate] = await Promise.all([
          t.get(subscriberCollection.where('plateNumberRaw', '==', plateRaw)),
          t.get(subscriberCollection.where('plateNumber', '==', plateNumber)),
        ]);
        for (const doc of [...subSnapRaw.docs, ...subSnapPlate.docs]) {
          const subData = doc.data() || {};
          const startDate = subData.startDate || '';
          const endDate = subData.endDate || '';
          if (startDate && endDate && today >= startDate && today <= endDate) {
            isSubscriberAuthoritative = true;
            break;
          }
        }
      } catch (subErr) {
        console.warn('[Server Check-In] Subscriber lookup failed inside transaction:', subErr);
        throw new Error('SUBSCRIBER_LOOKUP_UNAVAILABLE', { cause: subErr });
      }
      const resolvedStaffName = req.user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));
      const checkInGarage = garageDocumentToCheckInState(garageData, isSubscriberAuthoritative);
      const checkInVehicle = vehicleDocumentToCheckInState(vehicleSnap.exists ? vehicleSnap.data() || {} : null);
      const isUnlimited = checkInGarage.dailyCapacity === 0 || checkInGarage.activePackageName.includes('مفتوح');
      let fairUseDecision = null;
      if (isUnlimited) {
        const evalResult = evaluateFairUseCheckIn(
          garageData.unlimitedFairUse,
          garageData.durationDays || 30,
          garageData.activePackageName || ''
        );
        fairUseDecision = fairUseResultToDecision(evalResult);
      }
      const decision = decideVehicleCheckIn(
        { today, nowMs: Date.now(), plateNumber, plateNumberRaw: plateRaw },
        checkInGarage,
        checkInVehicle,
        fairUseDecision,
      );
      if (decision.ok === false) throw new Error(decision.error);
      const { isNewDay, used, capacity } = decision.value;
      const updatedFairUse = decision.value.fairUse?.updatedFairUse;
      const didAutoExtend = decision.value.fairUse?.autoExtended === true;
      
      t.set(vehicleRef, {
        id: plateRaw,
        plate: plateNumber,
        plateNumber,
        plateNumberRaw: plateRaw,
        type: type || 'hourly',
        isSubscriber: isSubscriberAuthoritative,
        entryTime: new Date(),
        status: 'inside',
        staffId: staffId || null,
        staffName: resolvedStaffName,
        enteredByUid: req.user?.uid || null,
        operationId,
        operationVersion: nextOperationVersion(vehicleSnap.data()?.operationVersion)
      }, { merge: true });

      const garageUpdate: any = {
        carsInside: (garageData.carsInside || 0) + 1,
        todayCount: isNewDay ? 1 : used + 1,
        todayRevenue: isNewDay ? 0 : (garageData.todayRevenue || 0),
        lastTransactionDate: today
      };
      if (updatedFairUse) {
        garageUpdate.unlimitedFairUse = updatedFairUse;
      }

      t.set(garageRef, garageUpdate, { merge: true });

      if (didAutoExtend && updatedFairUse) {
        const autoExtLogRef = adminDb.collection('activity_logs').doc();
        t.set(autoExtLogRef, {
          garageId,
          garageName: garageData.name || '',
          staffId: 'system',
          staffName: 'نظام الاستخدام العادل',
          actionType: 'fair_use_auto_extended',
          plateNumber: `تمديد تلقائي لسعة الباقة (+${updatedFairUse.stepAmount} سيارة)`,
          timestamp: new Date(),
          details: {
            currentAllowance: updatedFairUse.currentAllowance,
            maxAllowance: updatedFairUse.maxAllowance,
            cycleCarsCount: updatedFairUse.cycleCarsCount,
            tierType: updatedFairUse.tierType
          }
        });
      }

      if (!dailyStatsSnap.exists) {
        t.set(dailyStatsRef, {
          dateId: today,
          count: 1,
          limit: isUnlimited ? 0 : capacity,
          revenue: 0,
          createdAt: new Date()
        });
      } else {
        t.set(dailyStatsRef, { count: (dailyStatsSnap.data()?.count || 0) + 1 }, { merge: true });
      }

      const logRef = adminDb.collection('activity_logs').doc();
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
          type: type || 'hourly',
          status: 'inside',
          entryTime: new Date().toISOString(),
          staffId: staffId || null,
          staffName: resolvedStaffName,
          isSubscriber: isSubscriberAuthoritative,
        },
        carsInside: Number(garageUpdate.carsInside || 0),
        dailyCount: Number(garageUpdate.todayCount || 0),
        dailyCapacity: isUnlimited ? 0 : capacity,
      };
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: plateRaw,
        eventType: 'vehicle_entered',
        actorUid: req.user?.uid || staffId || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber,
          plateNumberRaw: plateRaw,
          type: type || 'hourly',
          isSubscriber: isSubscriberAuthoritative,
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleSnap.data()?.operationVersion),
          projectionDelta: createVehicleDelta('vehicle_entered')
        }
      });
      writeProjectionBucket(t, garageId, today, operationId, createVehicleDelta('vehicle_entered'));

      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/vehicles/check-in', req.user?.uid, requestFingerprint);
      }
    });

    const durationMs = Date.now() - requestStartedAt;
    res.setHeader('Server-Timing', `check-in;dur=${durationMs}`);
    console.info('[Server Check-In] completed', {
      correlationId: req.correlationId,
      durationMs,
      garageId,
      isSubscriber: isSubscriberAuthoritative,
    });
    return res.json({ success: true, data: resultData });
  } catch (err: any) {
    console.error('[Server] Check-in error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Vehicle Check-Out
router.post('/check-out', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const { garageId: bodyGarageId, vehicleId } = req.body || {};
    const callerRole = req.user?.role;
    let garageId = '';

    if (callerRole === 'garage' || callerRole === 'staff') {
      if (!req.user?.garageId) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' });
      }
      if (bodyGarageId && bodyGarageId !== req.user.garageId) {
        return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
      }
      garageId = req.user.garageId;
    } else if (callerRole === 'admin') {
      garageId = bodyGarageId;
    } else {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' });
    }

    const staffId = req.user?.uid;
    
    if (!garageId || !vehicleId) {
      return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
    }
    if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);

    const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let finalCost = 0;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-out', req.user?.uid);
        if (duplicate.isDuplicate) {
          finalCost = Number(duplicate.cachedResult?.cost || 0);
          return;
        }
      }
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const today = getCairoDateKey();
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);

      const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      if (!vehicleSnap.exists) throw new Error('VEHICLE_NOT_FOUND');

      const garageData = garageSnap.data() || {};
      const vehicleData = vehicleSnap.data() || {};

      const resolvedStaffName = req.user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));

      if (vehicleData.status === 'outside') {
        throw new Error('VEHICLE_ALREADY_OUTSIDE');
      }

      const cost = calculateVehicleCost(vehicleData, garageData);
      finalCost = cost;

      t.set(vehicleRef, {
        status: 'outside',
        exitTime: new Date(),
        totalCost: cost,
        operationId,
        operationVersion: nextOperationVersion(vehicleData.operationVersion)
      }, { merge: true });

      const isNewDay = garageData.lastTransactionDate !== today;
      
      t.set(garageRef, {
        totalRevenue: (garageData.totalRevenue || 0) + cost,
        totalVehiclesOut: (garageData.totalVehiclesOut || 0) + 1,
        todayRevenue: isNewDay ? cost : (garageData.todayRevenue || 0) + cost,
        todayCount: isNewDay ? 0 : (garageData.todayCount || 0),
        lastTransactionDate: today,
        carsInside: Math.max(0, (garageData.carsInside || 0) - 1)
      }, { merge: true });

      if (!dailyStatsSnap.exists) {
        t.set(dailyStatsRef, {
          dateId: today,
          count: 0,
          revenue: cost,
          createdAt: new Date()
        });
      } else {
        t.set(dailyStatsRef, { revenue: (dailyStatsSnap.data()?.revenue || 0) + cost }, { merge: true });
      }

      const logRef = adminDb.collection('activity_logs').doc();
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
        amount: cost
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: vehicleId,
        eventType: 'vehicle_exited',
        actorUid: req.user?.uid || staffId || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber: vehicleData.plateNumber || vehicleId,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          type: vehicleData.type || 'hourly',
          isSubscriber: !!vehicleData.isSubscriber,
          cost,
          entryTime: vehicleData.entryTime,
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleData.operationVersion),
          projectionDelta: createVehicleDelta('vehicle_exited', cost)
        }
      });
      writeProjectionBucket(t, garageId, today, operationId, createVehicleDelta('vehicle_exited', cost));
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { cost }, '/api/vehicles/check-out', req.user?.uid);
      }
    });

    return res.json({ success: true, data: { cost: finalCost } });
  } catch (err: any) {
    console.error('[Server] Check-out error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Vehicle Delete / Refund
router.post('/delete', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const { garageId: bodyGarageId, vehicleId, refundAmount } = req.body || {};
    const callerRole = req.user?.role;
    let garageId = '';

    if (callerRole === 'garage' || callerRole === 'staff') {
      if (!req.user?.garageId) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' });
      }
      if (bodyGarageId && bodyGarageId !== req.user.garageId) {
        return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
      }
      garageId = req.user.garageId;
    } else if (callerRole === 'admin') {
      garageId = bodyGarageId;
    } else {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' });
    }

    const staffId = req.user?.uid;
    
    if (!garageId || !vehicleId) {
      return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
    }
    if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);
    const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/delete', req.user?.uid);
        if (duplicate.isDuplicate) return;
      }
      const todayYMD = getCairoDateKey();
      const operationId = createOperationId(garageId, idempotencyKey || undefined);
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${todayYMD}`);

      const [garageDoc, vehicleDoc, dailyStatsDoc] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!garageDoc.exists) throw new Error('GARAGE_NOT_FOUND');
      if (!vehicleDoc.exists) throw new Error('VEHICLE_NOT_FOUND');
      
      const garageData = garageDoc.data() || {};
      const vehicleData = vehicleDoc.data() || {};
      
      const resolvedStaffName = req.user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));

      if (callerRole !== 'admin') {
        const entrantUid = vehicleData.enteredByUid || vehicleData.staffUid || vehicleData.staffId;
        const callerUid = req.user?.uid;
        const callerEntityId = req.user?.entityId;
        
        if (entrantUid && entrantUid !== callerUid && entrantUid !== callerEntityId) {
          throw new Error('CORRECTION_FORBIDDEN: Only the staff member who entered the vehicle can correct or delete it');
        }
      }

      const todayDeletions = garageData.lastDeletionDate === todayYMD ? (garageData.dailyDeletionCount || 0) : 0;
      if (todayDeletions >= 3 && callerRole !== 'admin') {
        throw new Error('reached_daily_deletion_limit');
      }

      const isSameRefundDay = garageData.lastRefundDate === todayYMD;
      const requestedRefund = Math.max(0, Number(refundAmount || 0));
      const maxEligibleRefund = (vehicleData.status === 'outside' && typeof vehicleData.totalCost === 'number')
        ? Math.max(0, vehicleData.totalCost)
        : 0;
      const refundAmt = Math.min(requestedRefund, maxEligibleRefund);

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

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || vehicleData.staffId || null,
        staffName: resolvedStaffName,
        actionType: 'delete_refund',
        plateNumber: `مسح لوحة: ${vehicleData.plateNumber || vehicleId}`,
        timestamp: new Date(),
        amount: refundAmt
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: vehicleId,
        eventType: refundAmt > 0 ? 'vehicle_refunded' : 'vehicle_deleted',
        actorUid: req.user?.uid || staffId || 'system',
        actorRole: callerRole,
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
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleData.operationVersion),
          projectionDelta: refundAmt > 0 ? createVehicleDelta('vehicle_refunded', refundAmt) : createVehicleDelta('vehicle_deleted')
        }
      });
      writeProjectionBucket(t, garageId, todayYMD, operationId, refundAmt > 0 ? createVehicleDelta('vehicle_refunded', refundAmt) : createVehicleDelta('vehicle_deleted'));
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/vehicles/delete', req.user?.uid);
      }
    });
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Server] Delete error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

export default router;
