import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { computeLookupHash, saveEntityPinInTransaction, checkPinAvailabilityAcrossAll } from '../utils';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from '../idempotency';
import { sanitizePayload, validateId, validateString, validateNumber, validateIdempotencyKey, validateNewPin } from '../validation';
import { mapDomainErrorToStatus } from './helpers';
import { calculateDailyProjection, getCairoDayBounds } from '../projections';
import { aggregateProjectionBuckets, isValidDateKey, reconcileDashboardSummary } from '../dashboardSummary';
import { reconcileGarageState } from '../domain/garageReconciliation';
import { canRunGarageMaintenance, canSubmitGarageApplication } from '../domain/authorization';
import { claimGarageDeletion, finalizeGarageDeletion, markGarageDeletionFailed, renewGarageDeletionLease } from '../adapters/garageDeletionAdapter';
import { deleteGarageOwnedData } from '../adapters/garageDeletionCleanupAdapter';

const router = Router();

function cairoDayBounds(date: string): { start: Date; end: Date } {
  if (!isValidDateKey(date)) throw new Error('INVALID_DATE');
  return getCairoDayBounds(date);
}

// Secure Server API: Authoritative Garage Creation
router.post('/create', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role;
    const callerUid = req.user?.uid;
    const callerName = req.user?.displayName || '';

    if (!canSubmitGarageApplication(req.user)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Creation not permitted for role' });
    }

    const sanitized = sanitizePayload(req.body, ['name', 'phone', 'hourlyRate', 'overnightRate', 'pin', 'billingModel', 'isTrial', 'trialDays', 'defaultTrialDays', 'dailyCapacity', 'initialPackageId', 'packages', 'createdByDelegateId', 'createdByDelegateName', 'referrerId', 'referrerName', 'referredByGarageId', 'referredByGarageName', 'idempotencyKey'], false);
    const name = validateString(sanitized.name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(sanitized.pin);
    const idempotencyKey = validateIdempotencyKey(
      sanitized.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']
    );

    if (!adminDb) {
      return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    }

    const delegateEntityId = callerRole === 'delegate' ? (req.user?.entityId || callerUid) : undefined;
    let requestFingerprint: string | undefined;
    if (idempotencyKey) {
      const fingerprintPayload: Record<string, unknown> = { ...sanitized };
      delete fingerprintPayload.idempotencyKey;
      delete fingerprintPayload.pin;
      fingerprintPayload.pinLookupHash = computeLookupHash(normPin);
      requestFingerprint = createRequestFingerprint({
        callerRole: callerRole || null,
        delegateEntityId: delegateEntityId || null,
        payload: fingerprintPayload
      });
    }

    const readExistingResult = async (): Promise<{ isDuplicate: boolean; cachedResult?: any }> => {
      if (!idempotencyKey) return { isDuplicate: false };
      let duplicate: { isDuplicate: boolean; cachedResult?: any } = { isDuplicate: false };
      await adminDb.runTransaction(async (t: any) => {
        duplicate = await checkIdempotencyInTransaction(
          t, idempotencyKey, '/api/garages/create', callerUid, requestFingerprint
        );
      });
      return duplicate;
    };

    const initialDuplicate = await readExistingResult();
    if (initialDuplicate.isDuplicate) return res.json(initialDuplicate.cachedResult);

    if (callerRole === 'delegate') {
      const cairoParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
      const cairoDayStart = new Date(`${cairoParts.year}-${cairoParts.month}-${cairoParts.day}T00:00:00+03:00`);
      const delegateGaragesToday = await adminDb.collection('garages')
        .where('createdByDelegateId', '==', delegateEntityId)
        .where('createdAt', '>=', cairoDayStart)
        .limit(3)
        .get();
      if (delegateGaragesToday.size >= 3) {
        const duplicate = await readExistingResult();
        if (duplicate.isDuplicate) return res.json(duplicate.cachedResult);
        return res.status(409).json({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' });
      }
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      const duplicate = await readExistingResult();
      if (duplicate.isDuplicate) return res.json(duplicate.cachedResult);
      return res.status(400).json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      });
    }

    const isTrial = sanitized.isTrial === undefined
      ? true
      : sanitized.isTrial === true || sanitized.isTrial === 'true';
    const rawTrialDays = sanitized.trialDays !== undefined ? sanitized.trialDays : sanitized.defaultTrialDays;
    const trialDays = rawTrialDays !== undefined
      ? validateNumber(rawTrialDays, 'trialDays', { min: 1, max: 365, required: false })
      : 2;
    const phone = sanitized.phone ? String(sanitized.phone).trim() : '';
    const hourlyRate = sanitized.hourlyRate !== undefined
      ? validateNumber(sanitized.hourlyRate, 'hourlyRate', { min: 0, max: 10000, required: false })
      : 0;
    const overnightRate = sanitized.overnightRate !== undefined
      ? validateNumber(sanitized.overnightRate, 'overnightRate', { min: 0, max: 10000, required: false })
      : 0;
    const billingModel = ['subscription', 'trial'].includes(sanitized.billingModel) ? sanitized.billingModel : 'subscription';

    const now = new Date();
    const dailyCapacity = isTrial ? 100 : 0;
    const activePackageName = isTrial ? `الباقة التجريبية (${trialDays} يوم)` : 'بدون باقة';
    const balanceExpiry = isTrial
      ? new Date(now.getTime() + (trialDays > 0 ? trialDays : 2) * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 1000);
    const garageRef = adminDb.collection('garages').doc();
    const garageId = garageRef.id;
    const logRef = adminDb.collection('activity_logs').doc();
    const garageDoc: any = {
      name: name.trim(),
      phone,
      hourlyRate,
      overnightRate,
      billingModel,
      status: (callerRole === 'delegate' || sanitized.createdByDelegateId) ? 'pending' : 'approved',
      hasMonthlySubscribers: false,
      createdAt: now,
      isTrial,
      dailyCapacity,
      activePackageName,
      packageName: activePackageName,
      balanceExpiry,
      balance: 0,
      carsInside: 0,
      carsInsideCount: 0,
      todayCount: 0,
      todayRevenue: 0,
      totalRevenue: 0,
      totalAdminRevenue: 0,
      totalVehiclesOut: 0,
      dailyDeletionCount: 0,
      dailyRefundCount: 0,
      totalReferralRewardDays: 0,
      totalGaragesReferredCount: 0,
      isLocked: false,
      isDeleting: false
    };

    if (callerRole === 'delegate') {
      garageDoc.createdByDelegateId = delegateEntityId;
      garageDoc.createdByDelegateName = sanitized.createdByDelegateName || callerName || 'المندوب';
      garageDoc.referrerId = delegateEntityId;
      garageDoc.referrerName = sanitized.referrerName || sanitized.createdByDelegateName || callerName || 'المندوب';
    } else if (sanitized.createdByDelegateId) {
      garageDoc.createdByDelegateId = sanitized.createdByDelegateId;
      garageDoc.createdByDelegateName = sanitized.createdByDelegateName || 'المندوب';
      garageDoc.referrerId = sanitized.referrerId || sanitized.createdByDelegateId;
      garageDoc.referrerName = sanitized.referrerName || sanitized.createdByDelegateName || 'المندوب';
    }

    if (sanitized.referredByGarageId) {
      garageDoc.referredByGarageId = sanitized.referredByGarageId;
      garageDoc.referredByGarageName = sanitized.referredByGarageName || '';
    }

    const activityLog = {
      garageId,
      garageName: garageDoc.name,
      staffId: callerUid || null,
      staffName: callerName || (isTrial ? 'النظام (تفعيل تجريبي)' : 'الإدارة (إنشاء جراج)'),
      actionType: isTrial ? 'recharge' : 'create',
      plateNumber: isTrial ? `تفعيل الباقة التجريبية (${trialDays} يوم)` : 'إنشاء حساب جراج جديد (بدون باقة)',
      timestamp: now,
      amount: 0,
      details: {
        packageName: isTrial ? `الباقة التجريبية (${trialDays} يوم)` : activePackageName,
        durationDays: isTrial ? trialDays : 0,
        carsCount: dailyCapacity,
        revenueAmount: 0,
        isTrial: Boolean(isTrial)
      }
    };
    const result = { success: true, id: garageId };
    let replayedResult: any;
    let isReplay = false;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(
          t, idempotencyKey, '/api/garages/create', callerUid, requestFingerprint
        );
        if (duplicate.isDuplicate) {
          isReplay = true;
          replayedResult = duplicate.cachedResult;
          return;
        }
      }

      await saveEntityPinInTransaction(t, 'garages', garageId, normPin);
      t.set(garageRef, garageDoc);
      t.set(logRef, activityLog);
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t, idempotencyKey, result, '/api/garages/create', callerUid, requestFingerprint
        );
      }
    });

    return res.json(isReplay ? replayedResult : result);
  } catch (e: any) {
    console.error('[Server Garage] Error in create garage:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Garage Deletion
router.post('/delete', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role;
    if (callerRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }

    const sanitized = sanitizePayload(req.body, ['garageId'], false);
    const garageId = validateId(sanitized.garageId, 'garageId', true);

    if (!adminDb) {
      return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    }

    const claim = await claimGarageDeletion(adminDb, garageId, callerRole, req.user?.uid);
    if (claim.kind === 'forbidden') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    if (claim.kind === 'not_found') {
      return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });
    }
    if (claim.kind === 'already_deleted') {
      return res.json({ success: true, alreadyDeleted: true });
    }
    if (claim.kind === 'in_progress') {
      const { statusCode, message } = mapDomainErrorToStatus(new Error('GARAGE_DELETION_IN_PROGRESS'));
      return res.status(statusCode).json({ success: false, error: message });
    }

    try {
      await deleteGarageOwnedData(adminDb, garageId, () => renewGarageDeletionLease(adminDb, garageId, claim.claimToken));
      await finalizeGarageDeletion(adminDb, garageId, claim.claimToken, claim.auditLogId, req.user?.uid, {
        garageId,
        garageName: claim.garageName,
        staffId: req.user?.uid || null,
        staffName: req.user?.displayName || 'الإدارة',
        actionType: 'garage_delete',
        plateNumber: `حذف جراج: ${claim.garageName}`,
        timestamp: new Date(),
        amount: 0,
        details: {
          deletedByRole: callerRole,
          deletedByUid: req.user?.uid || null
        }
      });
      return res.json({ success: true });
    } catch (e) {
      await markGarageDeletionFailed(adminDb, garageId, claim.claimToken).catch((markError) => {
        console.error('[Server Garage] Failed to release deletion claim:', markError);
      });
      throw e;
    }
  } catch (e: any) {
    console.error('[Server Garage] Error in delete garage:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Read-only consistency diagnostics & Event Ledger reconciliation
router.post('/reconciliation', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (!canRunGarageMaintenance(req.user, 'reconciliation')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    const garageId = validateId(req.body?.garageId, 'garageId', true);
    const garageRef = adminDb.doc(`garages/${garageId}`);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const { start: dayStart, end: nextDayStart } = cairoDayBounds(today);
    const [insideSnap, dailyStatsSnap, eventsSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get(),
      adminDb.collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'desc')
        .get()
    ]);
    const reconciliation = reconcileGarageState({
      today,
      insideVehicleCount: insideSnap.size,
      garage: garageSnap.data() || {},
      dailyStats: dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {},
      events: eventsSnap.docs.map((doc: any) => doc.data() || {})
    });
    return res.json({
      success: true,
      data: {
        garageId,
        date: today,
        ...reconciliation
      }
    });
  } catch (e: any) {
    console.error('[Server Garage] Error in reconciliation:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Admin-only Dashboard Summary Rebuild: Rebuilds the compact read model from buckets and events.
router.post('/dashboard-summary/rebuild', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (!canRunGarageMaintenance(req.user, 'dashboard-summary/rebuild')) return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    const { garageId, date } = req.body || {};
    if (!garageId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const targetDate = date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const { start: dayStart, end: nextDayStart } = cairoDayBounds(targetDate);
    const [bucketSnap, eventsSnap, garageSnap, dailyStatsSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', targetDate).get(),
      adminDb.collection(`garages/${garageId}/events`).where('occurredAt', '>=', dayStart.toISOString()).where('occurredAt', '<', nextDayStart.toISOString()).orderBy('occurredAt', 'asc').get(),
      adminDb.doc(`garages/${garageId}`).get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${targetDate}`).get()
    ]);
    if (!garageSnap.exists) return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });
    const eventProjection = calculateDailyProjection(eventsSnap.docs.map((doc: any) => doc.data() || {}), targetDate);
    const summary = aggregateProjectionBuckets(bucketSnap.docs.map((doc: any) => doc.data() || {}));
    const reconciliation = reconcileDashboardSummary(summary, eventProjection);
    const legacy = garageSnap.data() || {};
    const dailyStats = dailyStatsSnap.data() || {};
    const legacyDifferences = {
      activeVehicleCount: summary.activeVehicleCount - Number(legacy.carsInside || 0),
      entriesToday: summary.entriesToday - Number(dailyStats.count || 0),
      grossRevenue: Number((summary.grossRevenue - Number(dailyStats.revenue || 0)).toFixed(2))
    };
    const summaryData = { ...summary, garageId, dateId: targetDate, rebuiltAt: new Date().toISOString(), rebuiltBy: req.user?.uid || 'admin', eventProjection, reconciliation, legacyDifferences };
    await adminDb.doc(`garages/${garageId}/dashboard_summary/current`).set(summaryData, { merge: true });
    return res.json({ success: true, data: { summary: summaryData, bucketCount: bucketSnap.size, eventCount: eventsSnap.size, consistentWithEvents: reconciliation.consistent, legacyDifferences } });
  } catch (e: any) {
    console.error('[Server Garage] Error rebuilding dashboard summary:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Admin-only Projection Rebuild: Rebuilds daily_stats from the authoritative Event Ledger log
router.post('/rebuild-projections', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (!canRunGarageMaintenance(req.user, 'rebuild-projections')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    const { garageId, date } = req.body || {};
    if (!garageId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

    const targetDate = date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!isValidDateKey(targetDate)) return res.status(400).json({ success: false, error: 'INVALID_DATE' });
    const { start: dayStart, end: nextDayStart } = cairoDayBounds(targetDate);
    const eventsSnap = await adminDb.collection(`garages/${garageId}/events`)
      .where('occurredAt', '>=', dayStart.toISOString())
      .where('occurredAt', '<', nextDayStart.toISOString())
      .orderBy('occurredAt', 'asc')
      .get();

    const lastEvent = eventsSnap.docs.at(-1);
    const lastEventData = lastEvent?.data() || {};
    const eventWatermark = {
      lastProcessedOccurredAt: lastEventData.occurredAt || null,
      lastProcessedEventId: lastEventData.eventId || lastEvent?.id || null,
      projectionVersion: 1
    };

    const projection = calculateDailyProjection(
      eventsSnap.docs.map((doc: any) => doc.data() || {}),
      targetDate
    );

    const projectionRef = adminDb.doc(`garages/${garageId}/daily_stats/${targetDate}`);
    const projectionData = {
      ...projection,
      rebuiltAt: new Date().toISOString(),
      eventWatermark,
      rebuiltBy: req.user?.uid || 'admin'
    };

    await projectionRef.set(projectionData, { merge: true });

    return res.json({
      success: true,
      data: {
        garageId,
        date: targetDate,
        projection: projectionData
      }
    });
  } catch (e: any) {
    console.error('[Server Garage] Error in rebuild-projections:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

export default router;
