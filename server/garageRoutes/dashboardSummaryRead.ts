/**
 * GET /api/garages/:id/dashboard-summary — served from the maintained
 * daily summary with the stored rebuild as secondary source.
 *
 * Body moved verbatim from server/garageRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { withErrorHandler } from '../routes/combinators';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { canManageGarageScopedData as decideGarageScope } from '../domain/authorization';
import { isFreshDashboardSummary, normalizeStoredDashboardMoney } from '../dashboardSummary';
import { getCairoDateKey } from '../projections';
import { validateId } from '../validation';

export function registerGarageDashboardSummaryRead(app: WorkerApp): void {
app.get('/api/garages/:id/dashboard-summary', requireWorkerAuth, withErrorHandler(async (c) => {
  const startedAt = Date.now();
  const garageId = validateId(c.req.param('id'), 'garageId', true);
  const user = c.get('user');
  if (!decideGarageScope(user, garageId)) return c.json({ success: false, error: 'FORBIDDEN: Garage summary scope required' }, 403);
  const today = getCairoDateKey(new Date());
  const [garageSnap, dailyStatsSnap] = await Promise.all([
    adminDb.doc(`garages/${garageId}`).get(),
    adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get()
  ]);
  if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
  const dailyStatsData = dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {};
  const report = dailyStatsData.reportAggregateVersion === 1 && dailyStatsData.report
    ? dailyStatsData.report
    : undefined;
  c.header('Server-Timing', `dashboard-summary;dur=${Date.now() - startedAt}`);
  // projection_buckets is no longer written on the hot path (efficiency fix #477).
  // The primary source is the maintained_summary daily doc; the stored rebuild
  // is a secondary safety net for older data.
  const maintainedDailyRef = adminDb.doc(`garages/${garageId}/maintained_summary/daily_${today}`);
  const maintainedDailySnap = await maintainedDailyRef.get();
  if (maintainedDailySnap.exists) {
    const md = maintainedDailySnap.data() || {};
    const summary = {
      activeVehicleCount: Number(garageSnap.data()?.carsInside || 0),
      entriesToday: Number(md.todayEntries || 0),
      exitsToday: Number(md.todayExits || 0),
      grossRevenue: Number(md.todayRevenue || 0),
      refundTotal: 0,
      netRevenue: Number(md.todayRevenue || 0),
      garageId,
      dateId: today,
      rebuiltAt: new Date().toISOString(),
      source: 'maintained_daily_summary',
      ...(report ? { report } : {})
    };
    c.header('X-Summary-Source', 'maintained_daily_summary');
    return c.json({ success: true, data: { garageId, summary } });
  }
  const summarySnap = await adminDb.doc(`garages/${garageId}/dashboard_summary/current`).get();
  if (!summarySnap.exists) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_NOT_READY' }, 404);
  const storedSummary = summarySnap.data() || {};
  if (!isFreshDashboardSummary(storedSummary, today)) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
  const normalizedMoney = normalizeStoredDashboardMoney(storedSummary);
  if (!normalizedMoney) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
  c.header('X-Summary-Source', 'stored_rebuild');
  return c.json({ success: true, data: { garageId, summary: { ...storedSummary, ...normalizedMoney, ...(report ? { report } : {}) } } });
}, 'Garage'));
}
