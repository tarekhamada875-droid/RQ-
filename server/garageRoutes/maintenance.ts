/**
 * Read-only consistency diagnostics & maintenance routes:
 *   - POST /api/garages/reconciliation
 *   - POST /api/garages/dashboard-summary/rebuild
 *   - POST /api/garages/rebuild-projections
 *
 * Bodies moved verbatim from server/garageRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes. The shared day-scoped events
 * read cap (module-level in the original file) lives here now.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { canRunGarageMaintenance } from '../domain/authorization';
import { reconcileGarageState } from '../domain/garageReconciliation';
import { aggregateProjectionBuckets, isValidDateKey, reconcileDashboardSummary } from '../dashboardSummary';
import { calculateDailyProjection, getCairoDateKey, getCairoDayBounds } from '../projections';
import { parseMoneyAmount } from '../money';
import { validateId } from '../validation';
import { mapDomainErrorToStatus } from '../routes/helpers';

/**
 * Audit fix (2026-11-21): counts inside vehicles with a 450-doc page loop —
 * the reconciliation route only needs the COUNT, but it used to fetch ALL
 * inside-vehicle documents unbounded (its sibling recalculate-cars-inside was
 * already paginated for the same reason: 1k+ inside vehicles would blow the
 * Worker's 128 MB cap / read budget).
 */
export async function countVehiclesInside(garageId: string): Promise<number> {
  const PAGE_SIZE = 450;
  let actualCount = 0;
  let lastDoc: any = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query: any = adminDb.collection(`garages/${garageId}/vehicles`)
      .where('status', '==', 'inside')
      .orderBy('__name__')
      .limit(PAGE_SIZE);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const pageSnap = await query.get();
    actualCount += pageSnap.docs.length;
    if (pageSnap.docs.length < PAGE_SIZE) break; // last page
    lastDoc = pageSnap.docs[pageSnap.docs.length - 1];
  }
  return actualCount;
}

// Defensive read cap for the three day-scoped `garages/{garageId}/events` queries
// (reconciliation, dashboard-summary rebuild, rebuild-projections). Day-bounding
// already constrains volume, but this prevents a runaway garage (e.g. a faulty
// importer) from consuming the entire 50K-read/day budget in a single request.
// Single-field auto-index on `occurredAt` handles range+orderBy on the same field;
// no composite index declaration is required in firestore.indexes.json.
const DAY_SCOPED_EVENTS_READ_CAP = 500;

export function registerGarageMaintenance(app: WorkerApp): void {
// Read-only consistency diagnostics & Event Ledger reconciliation.
app.post('/api/garages/reconciliation', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'reconciliation')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const garageId = validateId(body?.garageId, 'garageId', true);
    const garageRef = adminDb.doc(`garages/${garageId}`);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    const today = getCairoDateKey(new Date());
    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(today);
    const [insideCount, dailyStatsSnap, eventsSnap] = await Promise.all([
      countVehiclesInside(garageId),
      adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get(),
      adminDb.collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'desc')
        .limit(DAY_SCOPED_EVENTS_READ_CAP)
        .get()
    ]);
    const reconciliation = reconcileGarageState({
      today,
      insideVehicleCount: insideCount,
      garage: garageSnap.data() || {},
      dailyStats: dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {},
      events: eventsSnap.docs.map((doc: any) => doc.data() || {})
    });

    // Audit fix (2026-11-21): a busy day (>500 events) silently computed
    // reconciliation from a PARTIAL event set. The flag lets callers detect
    // the truncation instead of trusting a wrong result.
    return c.json({ success: true, data: { garageId, date: today, eventReadTruncated: eventsSnap.size >= DAY_SCOPED_EVENTS_READ_CAP, ...reconciliation } });
  } catch (err: any) {
    console.error('[Worker Garage] Error in reconciliation:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

app.post('/api/garages/dashboard-summary/rebuild', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'dashboard-summary/rebuild')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { garageId, date } = body || {};
    if (!garageId || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const targetDate = date || getCairoDateKey(new Date());
    if (!isValidDateKey(targetDate)) throw new Error('INVALID_DATE');

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const [bucketSnap, eventsSnap, garageSnap, dailyStatsSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', targetDate).get(),
      adminDb.collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'asc')
        .limit(DAY_SCOPED_EVENTS_READ_CAP)
        .get(),
      adminDb.doc(`garages/${garageId}`).get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${targetDate}`).get()
    ]);
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    const eventProjection = calculateDailyProjection(
      eventsSnap.docs.map((doc: any) => doc.data() || {}),
      targetDate
    );
    const summary = aggregateProjectionBuckets(bucketSnap.docs.map((doc: any) => doc.data() || {}));
    const reconciliation = reconcileDashboardSummary(summary, eventProjection);
    const legacy = garageSnap.data() || {};
    const dailyStats = dailyStatsSnap.data() || {};
    const dailyRevenue = parseMoneyAmount(dailyStats.revenue) ?? 0;
    const legacyDifferences = {
      activeVehicleCount: summary.activeVehicleCount - Number(legacy.carsInside || 0),
      entriesToday: summary.entriesToday - Number(dailyStats.count || 0),
      grossRevenue: Number((summary.grossRevenue - dailyRevenue).toFixed(2))
    };
    const summaryData = {
      ...summary,
      garageId,
      dateId: targetDate,
      rebuiltAt: new Date().toISOString(),
      rebuiltBy: user?.uid || 'admin',
      eventProjection,
      reconciliation,
      legacyDifferences
    };
    await adminDb.doc(`garages/${garageId}/dashboard_summary/current`).set(summaryData, { merge: true });
    return c.json({
      success: true,
      data: {
        summary: summaryData,
        bucketCount: bucketSnap.size ?? bucketSnap.docs.length,
        eventCount: eventsSnap.size ?? eventsSnap.docs.length,
        consistentWithEvents: reconciliation.consistent,
        // Audit fix (2026-11-21): surface silent event-read truncation.
        eventReadTruncated: (eventsSnap.size ?? eventsSnap.docs.length) >= DAY_SCOPED_EVENTS_READ_CAP,
        legacyDifferences
      }
    });
  } catch (err: any) {
    console.error('[Worker Garage] Error rebuilding dashboard summary:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

app.post('/api/garages/rebuild-projections', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'rebuild-projections')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { garageId, date } = body || {};
    if (!garageId || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const targetDate = date || getCairoDateKey(new Date());
    if (!isValidDateKey(targetDate)) return c.json({ success: false, error: 'INVALID_DATE' }, 400);

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const eventsSnap = await adminDb.collection(`garages/${garageId}/events`)
      .where('occurredAt', '>=', dayStart.toISOString())
      .where('occurredAt', '<', nextDayStart.toISOString())
      .orderBy('occurredAt', 'asc')
      .limit(DAY_SCOPED_EVENTS_READ_CAP)
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
      rebuiltBy: user?.uid || 'admin'
    };

    await projectionRef.set(projectionData, { merge: true });
    // Audit fix (2026-11-21): surface silent event-read truncation — a
    // rebuilt projection from a partial event set is silently wrong.
    return c.json({ success: true, data: { garageId, date: targetDate, eventReadTruncated: eventsSnap.size >= DAY_SCOPED_EVENTS_READ_CAP, projection: projectionData } });
  } catch (err: any) {
    console.error('[Worker Garage] Error in rebuild-projections:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});
}
