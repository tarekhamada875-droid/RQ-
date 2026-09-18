import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { saveEntityPin, checkPinAvailabilityAcrossAll } from '../utils';
import { sanitizePayload, validateId, validateString, validateNumber, validateIdempotencyKey, validateNewPin } from '../validation';
import { manualAdminExtendFairUse, initializeFairUse } from '../unlimitedFairUse';
import { mapDomainErrorToStatus } from './helpers';
import { calculateDailyProjection } from '../projections';
import { aggregateProjectionBuckets, reconcileDashboardSummary } from '../dashboardSummary';
import { recordSummaryRead, SummaryReadSource } from '../summaryTelemetry';

const router = Router();

function cairoDayBounds(date: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_DATE');
  const start = new Date(`${date}T00:00:00+03:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

// Secure Server API: Authoritative Garage Creation
router.post('/create', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role;
    const callerUid = req.user?.uid;
    const callerName = req.user?.displayName || '';

    if (!callerRole || !['admin', 'delegate'].includes(callerRole)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Creation not permitted for role' });
    }

    const sanitized = sanitizePayload(req.body, ['name', 'phone', 'hourlyRate', 'overnightRate', 'pin', 'billingModel', 'isTrial', 'trialDays', 'defaultTrialDays', 'dailyCapacity', 'initialPackageId', 'packages', 'createdByDelegateId', 'createdByDelegateName', 'referrerId', 'referrerName', 'referredByGarageId', 'referredByGarageName', 'idempotencyKey'], false);

    const name = validateString(sanitized.name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(sanitized.pin);

    validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

    if (!adminDb) {
      return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    }

    if (callerRole === 'delegate') {
      const delegateEntityId = req.user?.entityId || callerUid;
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
        return res.status(409).json({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' });
      }
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
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
      : 15;
    const now = new Date();

    let balanceExpiry: Date;
    let dailyCapacity: number;
    let activePackageName: string;

    if (isTrial) {
      balanceExpiry = new Date(now.getTime() + (trialDays > 0 ? trialDays : 15) * 24 * 60 * 60 * 1000);
      dailyCapacity = 100;
      activePackageName = `الباقة التجريبية (${trialDays} يوم)`;
    } else {
      balanceExpiry = new Date(now.getTime() - 1000);
      dailyCapacity = 0;
      activePackageName = 'بدون باقة';
    }

    const garageRef = adminDb.collection('garages').doc();
    const garageId = garageRef.id;

    await saveEntityPin('garages', garageId, normPin);

    const garageDoc: any = {
      name: name.trim(),
      phone: sanitized.phone ? String(sanitized.phone).trim() : '',
      hourlyRate: sanitized.hourlyRate !== undefined ? validateNumber(sanitized.hourlyRate, 'hourlyRate', { min: 0, max: 10000, required: false }) : 0,
      overnightRate: sanitized.overnightRate !== undefined ? validateNumber(sanitized.overnightRate, 'overnightRate', { min: 0, max: 10000, required: false }) : 0,
      billingModel: ['subscription', 'trial'].includes(sanitized.billingModel) ? sanitized.billingModel : 'subscription',
      status: (callerRole === 'delegate' || sanitized.createdByDelegateId || sanitized.isPending) ? 'pending' : 'approved',
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
      const delegateEntityId = req.user?.entityId || callerUid;
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

    await garageRef.set(garageDoc);

    const logRef = adminDb.collection('activity_logs').doc();
    await logRef.set({
      garageId,
      garageName: garageDoc.name,
      staffId: callerUid || null,
      staffName: callerName || (isTrial ? 'النظام (تفعيل تجريبي)' : 'الإدارة (إنشاء جراج)'),
      actionType: isTrial ? 'recharge' : 'create',
      plateNumber: isTrial
        ? `تفعيل الباقة التجريبية (${trialDays} يوم)`
        : `إنشاء حساب جراج جديد (بدون باقة)`,
      timestamp: now,
      amount: 0,
      details: {
        packageName: isTrial ? `الباقة التجريبية (${trialDays} يوم)` : activePackageName,
        durationDays: isTrial ? trialDays : 0,
        carsCount: dailyCapacity,
        revenueAmount: 0,
        isTrial: Boolean(isTrial)
      }
    });

    return res.json({ success: true, id: garageId });
  } catch (e: any) {
    console.error('[Server Garage] Error in create garage:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Garage Update
router.post('/update', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const { id, ...data } = req.body || {};
    if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

    const callerRole = req.user?.role;

    if (callerRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    const allowedKeys = [
      'name', 'phone', 'hourlyRate', 'overnightRate', 'monthlySubscriptionFee', 
      'billingModel', 'commissionPerVehicle', 'status', 'isLocked', 'lockReason', 'isSuspended', 'isMaintenanceMode', 
      'maintenanceMessage', 'warningDaysThreshold', 'assignedDelegateId', 'currentSessionId',
      'hasMonthlySubscribers', 'checkInSound', 'checkOutSound', 'ownerName', 'dailyCapacity',
      'shimmerColor', 'activePackageName', 'trialDecision', 'trialDecisionAt'
    ];
    for (const key of allowedKeys) {
      if (key in data && data[key] !== undefined) {
        updates[key] = data[key];
      }
    }

    await adminDb.collection('garages').doc(id).update(updates);
    return res.json({ success: true });
  } catch (e: any) {
    console.error('[Server Garage] Error in update:', e);
    return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
  }
});

// Secure Server API: Garage Deletion
router.post('/delete', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role;
    if (callerRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }

    const sanitized = sanitizePayload(req.body, ['garageId', 'idempotencyKey'], false);
    const garageId = validateId(sanitized.garageId, 'garageId', true);

    if (!adminDb) {
      return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    }

    const garageRef = adminDb.doc(`garages/${garageId}`);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) {
      return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });
    }

    const garageData = garageSnap.data() || {};

    const subcollections = ['vehicles', 'subscribers', 'daily_counts', 'daily_stats'];
    for (const sub of subcollections) {
      const subCollRef = adminDb.collection(`garages/${garageId}/${sub}`);
      const subSnap = await subCollRef.get();
      if (!subSnap.empty) {
        const batch = adminDb.batch();
        subSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }

    await garageRef.delete();

    const logRef = adminDb.collection('activity_logs').doc();
    await logRef.set({
      garageId,
      garageName: garageData.name || '',
      staffId: req.user?.uid || null,
      staffName: req.user?.displayName || 'الإدارة',
      actionType: 'garage_delete',
      plateNumber: `حذف جراج: ${garageData.name || garageId}`,
      timestamp: new Date(),
      amount: 0,
      details: {
        deletedByRole: callerRole,
        deletedByUid: req.user?.uid || null
      }
    });

    return res.json({ success: true });
  } catch (e: any) {
    console.error('[Server Garage] Error in delete garage:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Update Garage Trial Decision
router.post('/trial-decision', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const { garageId, trialDecision } = req.body || {};
    if (!garageId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const validatedGarageId = validateId(garageId, 'garageId', true);

    if (trialDecision !== null && trialDecision !== 'continued' && trialDecision !== 'declined') {
      return res.status(400).json({ success: false, error: 'INVALID_TRIAL_DECISION' });
    }

    const garageRef = adminDb.collection('garages').doc(validatedGarageId);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });

    const updates: Record<string, any> = {
      trialDecision: trialDecision,
      trialDecisionAt: trialDecision ? new Date() : null,
      updatedAt: new Date()
    };

    await garageRef.update(updates);

    const logRef = adminDb.collection('activity_logs').doc();
    await logRef.set({
      garageId: validatedGarageId,
      garageName: garageSnap.data()?.name || '',
      staffId: req.user?.uid || null,
      staffName: req.user?.displayName || 'مستخدم',
      actionType: 'update_trial_decision',
      plateNumber: trialDecision ? `قرار التجربة: ${trialDecision}` : 'مسح قرار التجربة',
      timestamp: new Date(),
      amount: 0,
      details: { trialDecision }
    });

    return res.json({ success: true });
  } catch (e: any) {
    console.error('[Server Garage] Error in trial decision:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Recalculate Cars Inside
router.post('/recalculate-cars-inside', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    const { garageId } = req.body || {};
    if (!garageId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

    const vehSnap = await adminDb.collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get();
    const actualCount = vehSnap.size;

    await adminDb.collection('garages').doc(garageId).update({ carsInside: actualCount });
    return res.json({ success: true, count: actualCount });
  } catch (e: any) {
    console.error('[Server Garage] Error in recalculate-cars-inside:', e);
    return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
  }
});

// Read-only consistency diagnostics & Event Ledger reconciliation
router.post('/reconciliation', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (req.user?.role !== 'admin') {
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
    const garageData = garageSnap.data() || {};
    const stats = dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {};

    let eventDerivedRevenue = 0;
    let eventGrossRevenue = 0;
    let eventRefundRevenue = 0;
    let eventEntersCount = 0;
    let eventExitsCount = 0;
    let eventRefundsCount = 0;

    for (const doc of eventsSnap.docs) {
      const ev = doc.data() || {};
      if (ev.occurredAt) {
        if (ev.eventType === 'vehicle_entered') eventEntersCount++;
        if (ev.eventType === 'vehicle_exited') {
          eventExitsCount++;
          const cost = Number(ev.payload?.cost || 0);
          eventGrossRevenue += cost;
          eventDerivedRevenue += cost;
        }
        if (ev.eventType === 'vehicle_refunded') {
          eventRefundsCount++;
          const refund = Number(ev.payload?.refundAmount || 0);
          eventRefundRevenue += refund;
          eventDerivedRevenue -= refund;
        }
      }
    }

    const expected = {
      carsInside: insideSnap.size,
      todayCount: Number(stats.count || 0),
      todayRevenue: Number(stats.revenue || 0)
    };
    const actual = {
      carsInside: Number(garageData.carsInside || 0),
      todayCount: garageData.lastTransactionDate === today ? Number(garageData.todayCount || 0) : 0,
      todayRevenue: garageData.lastTransactionDate === today ? Number(garageData.todayRevenue || 0) : 0
    };
    const eventLedgerSummary = {
      totalRecordedEvents: eventsSnap.size,
      todayEnters: eventEntersCount,
      todayExits: eventExitsCount,
      todayRefunds: eventRefundsCount,
      eventGrossRevenue: Number(eventGrossRevenue.toFixed(2)),
      eventRefundRevenue: Number(eventRefundRevenue.toFixed(2)),
      eventDerivedRevenue: Number(eventDerivedRevenue.toFixed(2))
    };

    const differences = Object.fromEntries(Object.keys(expected).map((key) => [key, expected[key as keyof typeof expected] - actual[key as keyof typeof actual]]));
    const eventLedgerDifferences = {
      todayCount: Number(stats.count || 0) - eventEntersCount,
      todayExits: Number(stats.exitsCount || 0) - eventExitsCount,
      todayRevenue: Number(stats.revenue || 0) - Number(eventDerivedRevenue.toFixed(2))
    };
    const operationalStateConsistent = differences.carsInside === 0;
    const dailyStatsConsistent = differences.todayCount === 0 && differences.todayRevenue === 0;
    const eventLedgerConsistent = Object.values(eventLedgerDifferences).every((value) => value === 0);
    return res.json({
      success: true,
      data: {
        garageId,
        date: today,
        expected,
        actual,
        eventLedgerSummary,
        differences,
        eventLedgerDifferences,
        operationalStateConsistent,
        dailyStatsConsistent,
        eventLedgerConsistent,
        overallConsistent: operationalStateConsistent && dailyStatsConsistent && eventLedgerConsistent,
        isConsistent: operationalStateConsistent && dailyStatsConsistent && eventLedgerConsistent
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
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
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

// Read-only dashboard summary. The summary is served only to the owning garage/staff or admin.
router.get('/:id/dashboard-summary', requireAuth, async (req: AuthRequest, res: any) => {
  const startedAt = Date.now();
  let telemetrySource: SummaryReadSource = 'error';
  let telemetrySuccess = false;
  try {
    if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    const garageId = validateId(req.params.id, 'garageId', true);
    const callerRole = req.user?.role;
    const isAdmin = callerRole === 'admin';
    const isGarageScoped = (callerRole === 'garage' || callerRole === 'staff') && req.user?.garageId === garageId;
    if (!isAdmin && !isGarageScoped) return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage summary scope required' });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [bucketSnap, garageSnap, summarySnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', today).get(),
      adminDb.doc(`garages/${garageId}`).get(),
      adminDb.doc(`garages/${garageId}/dashboard_summary/current`).get()
    ]);
    if (!garageSnap.exists) return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });
    if (bucketSnap.empty) {
      if (!summarySnap.exists) {
        telemetrySource = 'not_ready';
        return res.status(404).json({ success: false, error: 'DASHBOARD_SUMMARY_NOT_READY' });
      }
      telemetrySource = 'stored_rebuild';
      telemetrySuccess = true;
      res.setHeader('Server-Timing', `dashboard-summary;dur=${Date.now() - startedAt}`);
      res.setHeader('X-Summary-Source', telemetrySource);
      return res.json({ success: true, data: { garageId, summary: summarySnap.data() || {} } });
    }
    const liveSummary = aggregateProjectionBuckets(bucketSnap.docs.map((doc: any) => doc.data() || {}));
    const summary = {
      ...liveSummary,
      activeVehicleCount: Number(garageSnap.data()?.carsInside || 0),
      garageId,
      dateId: today,
      rebuiltAt: new Date().toISOString(),
      source: 'live_projection_buckets'
    };
    telemetrySource = 'live_projection_buckets';
    telemetrySuccess = true;
    res.setHeader('Server-Timing', `dashboard-summary;dur=${Date.now() - startedAt}`);
    res.setHeader('X-Summary-Source', telemetrySource);
    res.setHeader('X-Summary-Bucket-Count', String(bucketSnap.size));
    return res.json({ success: true, data: { garageId, summary, bucketCount: bucketSnap.size } });
  } catch (e: any) {
    console.error('[Server Garage] Error reading dashboard summary:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  } finally {
    recordSummaryRead(telemetrySource, Date.now() - startedAt, telemetrySuccess);
  }
});

// Admin-only Projection Rebuild: Rebuilds daily_stats from the authoritative Event Ledger log
router.post('/rebuild-projections', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    const { garageId, date } = req.body || {};
    if (!garageId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

    const targetDate = date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
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

// Secure Server API: Admin Extend Garage Fair-Use Allowance
router.post('/:id/extend-fair-use', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }

    const garageId = validateId(req.params.id, 'garageId');
    const extraCars = Math.max(0, Number(req.body?.extraCars || 0));

    let resultFairUse: any = null;
    await adminDb.runTransaction(async (t: any) => {
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) {
        throw new Error('GARAGE_NOT_FOUND');
      }

      const garageData = garageSnap.data() || {};
      const isUnlimited = Number(garageData.dailyCapacity || 0) === 0 || String(garageData.activePackageName || '').includes('مفتوح');
      if (!isUnlimited) {
        throw new Error('NOT_AN_UNLIMITED_PACKAGE');
      }

      let fairUse = garageData.unlimitedFairUse;
      if (!fairUse || !fairUse.isActive) {
        fairUse = initializeFairUse(garageData.durationDays || 30, garageData.activePackageName || '');
      }

      resultFairUse = manualAdminExtendFairUse(fairUse, extraCars);
      t.set(garageRef, { unlimitedFairUse: resultFairUse }, { merge: true });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: req.user?.uid || 'admin',
        staffName: 'مدير النظام (Admin)',
        actionType: 'fair_use_admin_extended',
        plateNumber: `تمديد استثنائي للاستخدام العادل (+${extraCars > 0 ? extraCars : fairUse.stepAmount} سيارة)`,
        timestamp: new Date(),
        details: {
          currentAllowance: resultFairUse.currentAllowance,
          maxAllowance: resultFairUse.maxAllowance,
          cycleCarsCount: resultFairUse.cycleCarsCount
        }
      });
    });

    return res.json({ success: true, unlimitedFairUse: resultFairUse });
  } catch (err: any) {
    console.error('[Server Admin] Error in extend-fair-use:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

export default router;
