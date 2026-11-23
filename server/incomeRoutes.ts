/**
 * income route handlers — the admin Income page (owner feature, 2026-11-23).
 *
 * Two admin-only GET doors, both on-demand only (no listener, no polling —
 * read-economy rule, docs/PROJECT.md):
 *
 *  1. GET /api/admin/income/summary — lifetime income: the EGP garages paid
 *     for credits. Reads admin_summary/global.totalAdminRevenue (O(1), 1
 *     read warm). The summary doc was born 2026-10-29 and the
 *     request-approval path only started feeding it on 2026-11-21 (audit
 *     fix), so the stored total can undercount older grants. On the first
 *     call after this deploy we therefore run a ONE-TIME alignment:
 *       aligned = summary + max(0, sumOfGarageDocs - summary)
 *     where sumOfGarageDocs adds `totalAdminRevenue` across all garage
 *     docs (the authoritative per-grant counter, written in the same
 *     transaction as every grant). max(0, …) never lowers the number:
 *     income already received from deleted garages stays received, because
 *     garage deletion deliberately does not decrement the summary. The
 *     alignment is stamped with `incomeRecountAt` so it runs exactly once;
 *     afterwards every grant path increments both counters in the same
 *     transaction and they cannot drift apart again.
 *
 *  2. GET /api/admin/income/history — paged credit_ledger rows with
 *     kind=paid_grant (cash rows only — trial grants, referral awards,
 *     corrections, and debits are not cash income). Requires the
 *     (kind, occurredAt) composite index from firestore.indexes.json.
 *     Unlike the per-garage ledger route there is NO unfiltered fallback:
 *     unfiltered pages of the global ledger are dominated by debit rows,
 *     so a fallback would return mostly wrong kinds. Missing index → clear
 *     INCOME_HISTORY_INDEX_MISSING error instead of silently wrong data.
 *
 * Legacy rows predate garageName stamping; the history door resolves the
 * missing names with one getAll for the distinct garage ids on the page
 * (≤ pageSize extra reads, only for old rows — new rows carry the name).
 */
import type { WorkerApp } from './cloudflareWorker';
import { adminDb } from './firebaseAdmin';
import { requireWorkerAuth } from './sessionInfrastructure';
import { withAdmin, withErrorHandler } from './routes/combinators';
import { addMoneyRounded } from './money';
import { parseFirestorePageRequest, firestorePageStartAfter, buildFirestorePage } from './firestorePagination';

const RECOUNT_PAGE_SIZE = 450;

export function registerIncomeRoutes(app: WorkerApp): void {

app.get('/api/admin/income/summary', requireWorkerAuth, withErrorHandler(withAdmin(async (c: any) => {
  const summaryRef = adminDb.doc('admin_summary/global');
  const summarySnap = await summaryRef.get();
  const summary = summarySnap.exists ? summarySnap.data() || {} : {};
  const summaryRevenue = Number(summary.totalAdminRevenue ?? 0);

  if (!summary.incomeRecountAt) {
    // One-time alignment (see file header). Page through all garage docs and
    // add up the authoritative per-garage counter.
    let sum = 0;
    let lastDoc: any = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query: any = adminDb.collection('garages').orderBy('__name__').limit(RECOUNT_PAGE_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);
      const pageSnap = await query.get();
      for (const doc of pageSnap.docs) {
        sum = addMoneyRounded(sum, Number(doc.data()?.totalAdminRevenue ?? 0));
      }
      if (pageSnap.docs.length < RECOUNT_PAGE_SIZE) break; // last page
      lastDoc = pageSnap.docs[pageSnap.docs.length - 1];
    }
    const missing = Math.max(0, Math.round((sum - summaryRevenue) * 100) / 100);
    const alignedTotal = addMoneyRounded(summaryRevenue, missing);
    await summaryRef.set({
      totalAdminRevenue: alignedTotal,
      incomeRecountAt: new Date()
    }, { merge: true });
    return c.json({ success: true, data: { totalIncomeEgp: alignedTotal, recounted: true } });
  }

  return c.json({ success: true, data: { totalIncomeEgp: summaryRevenue, recounted: false } });
}), 'Income'));

app.get('/api/admin/income/history', requireWorkerAuth, withErrorHandler(withAdmin(async (c: any) => {
  const pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), 'income-history');
  const collection = adminDb.collection('credit_ledger');
  const base = collection
    .where('kind', '==', 'paid_grant')
    .orderBy('occurredAt', 'desc')
    .orderBy('__name__', 'desc');
  const query = firestorePageStartAfter(base, collection, pageRequest.cursor, 'occurredAt');
  let snapshot;
  try {
    snapshot = await query.limit(pageRequest.pageSize + 1).get();
  } catch (indexError: any) {
    // FAILED_PRECONDITION (code 9) = composite index (kind, occurredAt) not
    // built yet. No fallback on purpose (see file header).
    const isIndexError = indexError?.code === 9 || /index/i.test(String(indexError?.message || ''));
    if (!isIndexError) throw indexError;
    console.error('[income] credit_ledger (kind, occurredAt) composite index is missing — deploy firestore.indexes.json');
    return c.json({ success: false, error: 'INCOME_HISTORY_INDEX_MISSING' }, 500);
  }
  const page = buildFirestorePage(snapshot.docs, pageRequest, 'occurredAt');
  const rows = page.documents.map((doc: any) => {
    const row = doc.data() || {};
    return {
      id: doc.id,
      garageId: row.garageId,
      garageName: typeof row.garageName === 'string' ? row.garageName : '',
      amount: row.amount,
      paymentAmountEgp: row.paymentAmountEgp,
      balanceAfter: row.balanceAfter,
      occurredAt: row.occurredAt,
      reason: row.reason,
      source: row.source
    };
  });

  // Legacy rows were written before garageName stamping existed. Resolve the
  // missing names with one getAll for the distinct ids on this page so the
  // screen always shows a real garage name. New rows carry the name, so this
  // fades out naturally as history ages.
  const missingNameIds = [...new Set(rows
    .filter((row: any) => !row.garageName && row.garageId)
    .map((row: any) => row.garageId))];
  if (missingNameIds.length) {
    const garageSnaps = await adminDb.getAll(...missingNameIds.map((id: string) => adminDb.doc(`garages/${id}`)));
    const nameById = new Map<string, string>();
    garageSnaps.forEach((garageSnap: any, index: number) => {
      if (garageSnap?.exists) nameById.set(missingNameIds[index], String(garageSnap.data()?.name || ''));
    });
    for (const row of rows) {
      if (!row.garageName && nameById.has(row.garageId)) {
        row.garageName = nameById.get(row.garageId) || '';
      }
    }
  }

  // The paging fields live INSIDE data so apiCall's single unwrap keeps them
  // together with the rows (the per-garage ledger route returns them at the
  // top level, but its only client never pages).
  return c.json({
    success: true,
    data: { rows, hasMore: page.hasMore, nextCursor: page.nextCursor }
  });
}), 'Income'));

}
