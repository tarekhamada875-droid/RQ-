/**
 * Routes 5 & 6: GET /api/vehicles/inside and GET /api/vehicles/history.
 *
 * Bodies moved verbatim from server/vehicleRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { withErrorHandler } from '../routes/combinators';
import { safeDateMillis } from '../workerReadHelpers';
import { getCairoDateKey, getCairoDayBounds } from '../projections';

export function registerVehicleReads(app: WorkerApp): void {
// Route 5: GET /api/vehicles/inside
app.get('/api/vehicles/inside', requireWorkerAuth, withErrorHandler(async (c) => {
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

  const snap = await adminDb.collection(`garages/${garageId}/vehicles`)
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
}, 'Vehicle'));

// Route 6: GET /api/vehicles/history
app.get('/api/vehicles/history', requireWorkerAuth, withErrorHandler(async (c) => {
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

  const dateQuery = c.req.query('date') || getCairoDateKey(new Date());
  let dateRange: { start: Date; end: Date };
  try {
    dateRange = getCairoDayBounds(dateQuery);
  } catch {
    return c.json({ success: false, error: 'INVALID_DATE' }, 400);
  }
  const limitQuery = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));

  const snap = await adminDb.collection('activity_logs')
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
}, 'Vehicle'));
}
