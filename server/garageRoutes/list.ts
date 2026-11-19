/**
 * GET /api/garages — paginated garage list (admin sees all, delegate sees
 * own-created garages).
 *
 * Body moved verbatim from server/garageRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { withErrorHandler } from '../routes/combinators';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { buildFirestorePage, firestorePageStartAfter, parseFirestorePageRequest } from '../firestorePagination';

export function registerGarageList(app: WorkerApp): void {
app.get('/api/garages', requireWorkerAuth, withErrorHandler(async (c) => {
  const user = c.get('user');
  if (!['admin', 'delegate'].includes(user?.role || '')) {
    return c.json({ success: false, error: 'FORBIDDEN' }, 403);
  }

  const garagesCollection = adminDb.collection('garages');
  let query: any = garagesCollection;
  let pageScope = `garages:admin:${user.uid}`;
  if (user?.role === 'delegate') {
    const delegateId = user.entityId || user.uid;
    query = query.where('createdByDelegateId', '==', delegateId);
    pageScope = `garages:delegate:${delegateId}`;
  }

  let pageRequest;
  try {
    pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), pageScope);
  } catch (error: any) {
    return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
  }
  query = query.orderBy('__name__', 'desc');
  query = firestorePageStartAfter(query, garagesCollection, pageRequest.cursor, '__name__');
  const snap = await query.limit(pageRequest.pageSize + 1).get();
  const garagePage = buildFirestorePage(snap.docs, pageRequest, '__name__');
  const garages = garagePage.documents.map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));

  // Perf audit F1: the list used to be sent twice (`garages` + `items`), doubling
  // the payload of the heaviest admin endpoint. Frontend only reads `garages`.
  return c.json({ success: true, garages, hasMore: garagePage.hasMore, nextCursor: garagePage.nextCursor });
}, 'Garage'));
}
