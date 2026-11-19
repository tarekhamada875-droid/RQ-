/**
 * Garage deletion routes (POST delete, POST delete-step, GET delete-status).
 * The handlers live in garageDeletionRoutes.ts; all three routes share the
 * same server authority.
 *
 * Moved verbatim from server/garageRoutes.ts (audit Phase 3 file split,
 * 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { withAdmin } from '../routes/combinators';
import { startGarageDeletionRoute, advanceGarageDeletionRoute, readGarageDeletionStatusRoute } from '../garageDeletionRoutes';

export function registerGarageDeletionRoutes(app: WorkerApp): void {
// Garage deletion handlers live in a dedicated module; all three routes share the same server authority.
app.post('/api/garages/delete', requireWorkerAuth, withAdmin(startGarageDeletionRoute, { withCodeAndStatus: true }));
app.post('/api/garages/delete-step', requireWorkerAuth, withAdmin(advanceGarageDeletionRoute, { withCodeAndStatus: true }));
app.get('/api/garages/delete-status', requireWorkerAuth, withAdmin(readGarageDeletionStatusRoute, { withCodeAndStatus: true }));
}
