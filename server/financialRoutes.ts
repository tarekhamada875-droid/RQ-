import type { WorkerApp } from './cloudflareWorker';
import { readWorkerFirestorePage } from './cloudflareWorker';
import { adminDb } from './firebaseAdmin';
import { requireWorkerAuth } from './sessionInfrastructure';
import { validateIdempotencyKey } from './validation';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { recordDomainEventInTransaction } from './events';
import { parseFirestorePageRequest } from './firestorePagination';
import { withErrorHandler } from './routes/combinators';
import { sanitizeDelegateDoc } from './workerReadHelpers';

export function registerFinancialRoutes(app: WorkerApp): void {
// 9. Financial Transactions, Recharge Requests, Delegate Commissions & Reporting (CF7)

// Handler 7: Delegate Commission Earnings & Dashboard (GET /api/delegate/commission-earnings & GET /api/delegates/dashboard)
const handleDelegateDashboard = withErrorHandler(async (c: any) => {
  const user = c.get('user');
  if (user?.role !== 'delegate' || !user.entityId || !adminDb) {
    return c.json({ success: false, error: 'FORBIDDEN' }, 403);
  }

  const delegateId = user.entityId;
  const delegateRef = adminDb.collection('delegates').doc(delegateId);
  const delegateSnap = await delegateRef.get();
  if (!delegateSnap.exists) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);

  const section = c.req.query('section');
  const garagesCollection = adminDb.collection('garages');
  const childQuery = (name: string) => name === 'createdGarages'
    ? garagesCollection.where('createdByDelegateId', '==', delegateId)
    : garagesCollection.where('referrerId', '==', delegateId);
  const allowedSections = ['createdGarages', 'referredGarages'];
  const readChildPage = async (name: string, cursor?: string) => {
    const pageRequest = parseFirestorePageRequest(c.req.query('limit'), cursor, `delegate-dashboard:${delegateId}:${name}`);
    return readWorkerFirestorePage(childQuery(name), garagesCollection, pageRequest);
  };
  try {
    if (section && section !== 'all') {
      if (!allowedSections.includes(section)) return c.json({ success: false, error: 'INVALID_PAGE_SECTION' }, 400);
      const page = await readChildPage(section, c.req.query('cursor'));
      const garages = page.documents.map((doc: any) => sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));
      return c.json({
        success: true,
        delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
        garages,
        items: garages,
        hasMore: page.hasMore,
        nextCursor: page.nextCursor,
        pagination: { [section]: { hasMore: page.hasMore, nextCursor: page.nextCursor } }
      });
    }

    const [createdPage, referredPage] = await Promise.all([
      readChildPage('createdGarages', c.req.query('createdGaragesCursor')),
      readChildPage('referredGarages', c.req.query('referredGaragesCursor'))
    ]);
    const garagesById = new Map<string, any>();
    for (const doc of [...createdPage.documents, ...referredPage.documents]) {
      garagesById.set(doc.id, sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));
    }
    return c.json({
      success: true,
      delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
      garages: Array.from(garagesById.values()),
      pagination: {
        createdGarages: { hasMore: createdPage.hasMore, nextCursor: createdPage.nextCursor },
        referredGarages: { hasMore: referredPage.hasMore, nextCursor: referredPage.nextCursor }
      }
    });
  } catch (error: any) {
    if (error?.message === 'INVALID_PAGE_SIZE' || error?.message === 'INVALID_PAGE_CURSOR') {
      return c.json({ success: false, error: error.message }, 400);
    }
    throw error;
  }
}, 'Financial');

app.get('/api/delegate/commission-earnings', requireWorkerAuth, handleDelegateDashboard);
app.get('/api/delegates/dashboard', requireWorkerAuth, handleDelegateDashboard);

// Handler 8: Settle Delegate Commission / Withdrawal (POST /api/delegate/withdraw-commission & POST /api/delegates/settle-account)
const handleSettleDelegateAccount = async (c: any) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const id = body.id || body.delegateId;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    const requestFingerprint = createRequestFingerprint({ id });
    const delRef = adminDb.collection('delegates').doc(id);
    const now = new Date();
    let previousTotal = 0;
    let settlementId = '';
    let duplicateResult: any = null;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/delegates/settle-account', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          duplicateResult = duplicate.cachedResult;
          return;
        }
      }
      const snap = await t.get(delRef);
      if (!snap.exists) throw new Error('DELEGATE_NOT_FOUND');
      const data = snap.data() || {};
      previousTotal = Number(data.totalRechargedAmount || 0);
      if (!Number.isFinite(previousTotal) || previousTotal <= 0) {
        throw new Error('NO_UNSETTLED_COMMISSION');
      }
      const settlementRef = adminDb.collection('settlements').doc();
      settlementId = settlementRef.id;
      t.set(settlementRef, {
        settlementId,
        delegateId: id,
        cutoffTime: now,
        previousCycleTotal: previousTotal,
        settledByUid: user?.uid || 'admin',
        settledAt: now,
        idempotencyKey: idempotencyKey || null,
        createdAt: now
      });
      t.update(delRef, {
        lastSettledAt: now,
        totalRechargedAmount: 0,
        updatedAt: now
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId: 'global',
        aggregateType: 'delegate',
        aggregateId: id,
        eventType: 'delegate_settled',
        actorUid: user?.uid || 'admin',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        eventCollectionPath: `delegates/${id}/events`,
        payload: {
          delegateId: id,
          settlementId,
          previousRechargedAmount: previousTotal,
          settledAt: now.toISOString()
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t,
          idempotencyKey,
          { success: true, settlementId, settledAt: now.toISOString(), previousRechargedAmount: previousTotal },
          '/api/delegates/settle-account',
          user?.uid,
          requestFingerprint
        );
      }
    });

    if (duplicateResult) return c.json(duplicateResult);
    return c.json({ success: true, settlementId, settledAt: now.toISOString(), previousRechargedAmount: previousTotal });
  } catch (err: any) {
    console.error('[Worker Delegate] Error settling account:', err);
    if (err?.message === 'NO_UNSETTLED_COMMISSION') {
      return c.json({ success: false, error: 'NO_UNSETTLED_COMMISSION' }, 409);
    }
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
};

app.post('/api/delegate/withdraw-commission', requireWorkerAuth, handleSettleDelegateAccount);
app.post('/api/delegates/settle-account', requireWorkerAuth, handleSettleDelegateAccount);

// Handler 9 (GET /api/financial-summary & GET /api/reports/financial) was deleted
// as dead code — no client caller. See PR-B2.

}
