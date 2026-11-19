/**
 * GET /api/garages/:id — single garage detail.
 *
 * Body moved verbatim from server/garageRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { withErrorHandler } from '../routes/combinators';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { canManageGarageScopedData as decideGarageScope } from '../domain/authorization';
import { validateId } from '../validation';

export function registerGarageDetail(app: WorkerApp): void {
app.get('/api/garages/:id', requireWorkerAuth, withErrorHandler(async (c) => {
  // Audit N11 (Phase 1, 2026-11-06): validate the id param using
  // validateId (same as POST /api/garages/:id/reconcile at line 771).
  // Previously this route just checked truthiness, allowing IDs with
  // whitespace or path-traversal characters to reach Firestore.
  const id = validateId(c.req.param('id'), 'garageId', true);
  const user = c.get('user');
  if (!decideGarageScope(user, id)) {
    return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
  }
  const docSnap = await adminDb.doc(`garages/${id}`).get();
  if (!docSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

  return c.json({ success: true, garage: { id: docSnap.id, ...docSnap.data() } });
}, 'Garage'));
}
