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
import { isUsableMaintainedSummary, maintainedGarageSummaryRef } from '../workerMaintenance';

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

  // ISSUE 3 (owner debug audit, finding 3, 2026-11-19): the admin/delegate
  // garage list endpoint was returning the raw `carsInside` field from each
  // garage doc. That field is maintained by check-in/check-out handlers via
  // read-modify-write (NOT a transactional increment), so it drifts whenever
  // a transaction is interrupted (tab closed, network failed, SW stale).
  // The owner's debug file showed carsInside=0 on the admin list view for a
  // garage that actually had 67 vehicles inside — verified by the same
  // garage's verify-pin response which correctly read from the maintained
  // summary doc.
  //
  // Fix: batch-read the maintained_summary/current doc for every garage on
  // the page (one Firestore read per garage — counts as N reads against the
  // daily quota but is far cheaper than re-running the dashboard-summary
  // rebuild on each list call). When a maintained summary is fresh and
  // schema-current, override the doc-stored carsInside with the maintained
  // value. When the maintained summary is missing/stale (e.g. a brand-new
  // garage that has never had a check-in or a dashboard-summary rebuild),
  // fall back to the doc-stored value so we don't lose data.
  if (garages.length > 0) {
    const summaryRefs = garages.map((g: any) => maintainedGarageSummaryRef(g.id));
    const summarySnaps = await Promise.all(summaryRefs.map((ref: any) => ref.get()));
    for (let i = 0; i < garages.length; i += 1) {
      const summarySnap = summarySnaps[i];
      const summary = summarySnap.exists ? summarySnap.data() || {} : null;
      if (summary && isUsableMaintainedSummary(summary, ['carsInside'])) {
        // Override the doc-stored value with the authoritative maintained count.
        // The maintained summary is updated transactionally via FieldValue.increment
        // on every check-in/check-out, so it's always accurate even when the
        // doc-stored carsInside has drifted.
        garages[i].carsInside = Number(summary.carsInside || 0);
      }
    }
  }

  // Perf audit F1: the list used to be sent twice (`garages` + `items`), doubling
  // the payload of the heaviest admin endpoint. Frontend only reads `garages`.
  return c.json({ success: true, garages, hasMore: garagePage.hasMore, nextCursor: garagePage.nextCursor });
}, 'Garage'));
}
