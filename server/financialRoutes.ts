import type { WorkerApp } from './cloudflareWorker';

export type FinancialRouteDependency = (...args: any[]) => any;

export interface FinancialRouteDeps {
  getAdminDb: () => any;
  requireWorkerAuth: FinancialRouteDependency;
  enforceWorkerFinancialRateLimit: FinancialRouteDependency;
  validateId: FinancialRouteDependency;
  validateIdempotencyKey: FinancialRouteDependency;
  checkIdempotencyInTransaction: FinancialRouteDependency;
  createRequestFingerprint: FinancialRouteDependency;
  storeIdempotencyInTransaction: FinancialRouteDependency;
  recordDomainEventInTransaction: FinancialRouteDependency;
  parseFirestorePageRequest: FinancialRouteDependency;
  readWorkerFirestorePage: FinancialRouteDependency;
  sanitizeDelegateDoc: FinancialRouteDependency;
  canViewFinancialReport: FinancialRouteDependency;
  addFinancialReportCreditLedgerEntry: FinancialRouteDependency;
  addFinancialReportEvent: FinancialRouteDependency;
  addFinancialReportSettlement: FinancialRouteDependency;
  createFinancialReportAccumulator: FinancialRouteDependency;
  finishFinancialReport: FinancialRouteDependency;
}

export function registerFinancialRoutes(app: WorkerApp, deps: FinancialRouteDeps): void {
  const {
    getAdminDb,
    requireWorkerAuth,
    enforceWorkerFinancialRateLimit,
    validateId,
    validateIdempotencyKey,
    checkIdempotencyInTransaction,
    createRequestFingerprint,
    storeIdempotencyInTransaction,
    recordDomainEventInTransaction,
    parseFirestorePageRequest,
    readWorkerFirestorePage,
    sanitizeDelegateDoc,
    canViewFinancialReport,
    addFinancialReportCreditLedgerEntry,
    addFinancialReportEvent,
    addFinancialReportSettlement,
    createFinancialReportAccumulator,
    finishFinancialReport
  } = deps;
// 9. Financial Transactions, Recharge Requests, Delegate Commissions & Reporting (CF7)

// Legacy recharge-request endpoints remain authenticated for compatibility, but no longer
// inspect request payloads or access request records. New prepaid grants use their own routes.
const retiredRechargeRequest = (allowedRoles?: string[]) => async (c: any) => {
  const user = c.get('user');
  if (allowedRoles && !allowedRoles.includes(user?.role)) return c.json({ success: false, error: 'FORBIDDEN' }, 403);
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
};

const retireRechargeCreation = retiredRechargeRequest(['garage', 'delegate']);
const retireRechargeAdminAction = retiredRechargeRequest(['admin']);
const retireRechargeHistory = retiredRechargeRequest(['admin']);
const retireMyRechargeHistory = retiredRechargeRequest();
app.post('/api/recharge-requests/create', requireWorkerAuth, enforceWorkerFinancialRateLimit, retireRechargeCreation);
app.post('/api/recharge-requests', requireWorkerAuth, enforceWorkerFinancialRateLimit, retireRechargeCreation);
app.post('/api/recharge-requests/process', requireWorkerAuth, retireRechargeAdminAction);
app.post('/api/transactions/approve-recharge-request', requireWorkerAuth, retireRechargeAdminAction);
app.post('/api/recharge-requests/reject', requireWorkerAuth, retireRechargeAdminAction);
app.post('/api/transactions/reject-recharge-request', requireWorkerAuth, retireRechargeAdminAction);
app.get('/api/recharge-requests', requireWorkerAuth, retireRechargeHistory);
app.get('/api/recharge-requests/my', requireWorkerAuth, retireMyRechargeHistory);

// Retired owner-wallet endpoint remains an authenticated compatibility tombstone.
app.post('/api/transactions/admin-topup-balance', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
});

// Handler 7: Delegate Commission Earnings & Dashboard (GET /api/delegate/commission-earnings & GET /api/delegates/dashboard)
const handleDelegateDashboard = async (c: any) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'delegate' || !user.entityId || !getAdminDb()) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }

    const delegateId = user.entityId;
    const delegateRef = getAdminDb().collection('delegates').doc(delegateId);
    const delegateSnap = await delegateRef.get();
    if (!delegateSnap.exists) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);

    const section = c.req.query('section');
    if (section === 'requests') {
      return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
    }

    const garagesCollection = getAdminDb().collection('garages');
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
  } catch (err: any) {
    console.error('[Worker Delegate] Error loading dashboard:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
};

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
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    const requestFingerprint = createRequestFingerprint({ id });
    const delRef = getAdminDb().collection('delegates').doc(id);
    const now = new Date();
    let previousTotal = 0;
    let settlementId = '';
    let duplicateResult: any = null;

    await getAdminDb().runTransaction(async (t: any) => {
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
      const settlementRef = getAdminDb().collection('settlements').doc();
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
      recordDomainEventInTransaction(t, getAdminDb(), {
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

// Admin-only commission history for the delegate detail screen. Commission events
// are the canonical source for fixed first-paid-grant commissions; legacy recharge
// activity logs remain available separately for historical sales.
app.get('/api/delegates/:id/commission-history', requireWorkerAuth, enforceWorkerFinancialRateLimit, async (c: any) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const delegateId = validateId(c.req.param('id'), 'id', true);
    const delegateSnap = await getAdminDb().collection('delegates').doc(delegateId).get();
    if (!delegateSnap.exists) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);

    const snapshot = await getAdminDb().collectionGroup('events')
      .where('payload.delegateId', '==', delegateId)
      .where('eventType', 'in', ['commission_earned', 'delegate_settled'])
      .get();
    const items = snapshot.docs
      .map((document: any) => document.data() || {})
      .filter((event: any) => event.eventType === 'commission_earned' || event.eventType === 'delegate_settled')
      .map((event: any) => ({
        eventId: String(event.eventId || ''),
        eventType: event.eventType,
        occurredAt: String(event.occurredAt || ''),
        garageId: typeof event.garageId === 'string' ? event.garageId : undefined,
        commissionAmount: event.eventType === 'commission_earned' && Number.isFinite(event.payload?.commissionAmount)
          ? Number(event.payload.commissionAmount)
          : undefined,
        previousRechargedAmount: event.eventType === 'delegate_settled' && Number.isFinite(event.payload?.previousRechargedAmount)
          ? Number(event.payload.previousRechargedAmount)
          : undefined,
        settlementId: event.eventType === 'delegate_settled' && typeof event.payload?.settlementId === 'string'
          ? event.payload.settlementId
          : undefined,
        sourceCreditGrantId: event.eventType === 'commission_earned' && typeof event.payload?.sourceCreditGrantId === 'string'
          ? event.payload.sourceCreditGrantId
          : undefined
      }))
      .sort((a: any, b: any) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

    return c.json({ success: true, items });
  } catch (error: any) {
    console.error('[Worker Delegate] Error loading commission history:', error);
    return c.json({ success: false, error: error?.message || 'COMMISSION_HISTORY_FAILED' }, 500);
  }
});

// Handler 9: Financial Summary Report (GET /api/financial-summary & GET /api/reports/financial)
const handleFinancialSummaryReport = async (c: any) => {
  try {
    const user = c.get('user');
    if (!canViewFinancialReport(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const requestedStart = c.req.query('start');
    const requestedEnd = c.req.query('end');
    const delegateId = c.req.query('delegateId') ? validateId(c.req.query('delegateId'), 'delegateId', true) : undefined;

    const isStrictDateOnly = (value?: string) => {
      if (value === undefined) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!isStrictDateOnly(requestedStart) || !isStrictDateOnly(requestedEnd)) {
      return c.json({ success: false, code: 'INVALID_REPORT_DATE', error: 'INVALID_REPORT_DATE', statusCode: 400 }, 400);
    }

    if (requestedStart && requestedEnd && new Date(requestedStart) >= new Date(requestedEnd)) {
      return c.json({ success: false, code: 'START_MUST_PRECEDE_END', error: 'START_MUST_PRECEDE_END', statusCode: 400 }, 400);
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const defaultEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const subtractOneCalendarYear = (date: Date) => {
      const year = date.getUTCFullYear() - 1;
      const month = date.getUTCMonth();
      const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
      return new Date(Date.UTC(year, month, day));
    };
    // No-date reports default to the latest 12 calendar months. Partial ranges
    // are bounded too; older history remains available through explicit dates.
    const start = requestedStart || subtractOneCalendarYear(requestedEnd ? new Date(`${requestedEnd}T00:00:00.000Z`) : today).toISOString().slice(0, 10);
    const end = requestedEnd || defaultEnd.toISOString().slice(0, 10);
    if (new Date(start) >= new Date(end)) {
      return c.json({ success: false, code: 'START_MUST_PRECEDE_END', error: 'START_MUST_PRECEDE_END', statusCode: 400 }, 400);
    }
    // Apply inclusive-start/exclusive-end boundaries in Firestore and process
    // stable cursor pages so Worker memory is independent of ledger history.
    const startAt = new Date(`${start}T00:00:00.000Z`);
    const endAt = new Date(`${end}T00:00:00.000Z`);
    // Domain events persist occurredAt as an ISO string, unlike settlement
    // records, whose settledAt field is a Firestore Timestamp/Date.
    const eventStartAt = startAt.toISOString();
    const eventEndAt = endAt.toISOString();
    let eventsQuery: any = getAdminDb().collectionGroup('events');
    let settlementsQuery: any = getAdminDb().collection('settlements');
    let creditLedgerQuery: any = getAdminDb().collection('credit_ledger');
    eventsQuery = eventsQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    settlementsQuery = settlementsQuery.where('settledAt', '>=', startAt).where('settledAt', '<', endAt);
    if (!delegateId) creditLedgerQuery = creditLedgerQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    const accumulator = createFinancialReportAccumulator({ start, end, delegateId });
    const pageSize = 250;
    const forEachPage = async (baseQuery: any, timestampField: string, consume: (value: any) => void) => {
      let cursor: any = null;
      while (true) {
        let pageQuery = baseQuery.orderBy(timestampField, 'asc').orderBy('__name__', 'asc').limit(pageSize);
        if (cursor) pageQuery = pageQuery.startAfter(cursor.timestamp, cursor.ref);
        const page = await pageQuery.get();
        if (page.docs.length === 0) break;
        for (const document of page.docs) consume(document.data() || {});
        if (page.docs.length < pageSize) break;
        const last = page.docs[page.docs.length - 1];
        cursor = { timestamp: last.data()?.[timestampField], ref: last.ref };
      }
    };
    // Load settlement cutoffs before events; keep only totals and one latest
    // timestamp per delegate, never the underlying document arrays.
    await forEachPage(settlementsQuery, 'settledAt', (settlement) => addFinancialReportSettlement(accumulator, settlement));
    await forEachPage(eventsQuery, 'occurredAt', (event) => addFinancialReportEvent(accumulator, event));
    if (!delegateId) await forEachPage(creditLedgerQuery, 'occurredAt', (entry) => addFinancialReportCreditLedgerEntry(accumulator, entry));
    const report = finishFinancialReport(accumulator);

    return c.json({
      success: true,
      data: {
        report,
        filters: { start, end, delegateId: delegateId || null },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Worker Reports] Error generating financial report:', err);
    return c.json({ success: false, error: err?.message || 'REPORT_GENERATION_FAILED' }, 500);
  }
};

app.get('/api/financial-summary', requireWorkerAuth, handleFinancialSummaryReport);
app.get('/api/reports/financial', requireWorkerAuth, handleFinancialSummaryReport);

}
