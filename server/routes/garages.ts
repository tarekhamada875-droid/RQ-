import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { mapDomainErrorToStatus } from './helpers';
import { calculateDailyProjection, getCairoDayBounds } from '../projections';
import { aggregateProjectionBuckets, isValidDateKey, reconcileDashboardSummary } from '../dashboardSummary';
import { canRunGarageMaintenance } from '../domain/authorization';

const router = Router();

function cairoDayBounds(date: string): { start: Date; end: Date } {
  if (!isValidDateKey(date)) throw new Error('INVALID_DATE');
  return getCairoDayBounds(date);
}

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
