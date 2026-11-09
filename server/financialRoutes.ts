import type { WorkerApp } from './cloudflareWorker';
import { readWorkerFirestorePage } from './cloudflareWorker';
import { adminDb } from './firebaseAdmin';
import { requireWorkerAuth } from './sessionInfrastructure';
import { validateId, validateIdempotencyKey } from './validation';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { recordDomainEventInTransaction } from './events';
import { parseFirestorePageRequest } from './firestorePagination';
import { canViewFinancialReport } from './domain/authorization';
import { withErrorHandler } from './routes/combinators';
import { createFinancialReportAccumulator, finishFinancialReport, addFinancialReportCreditLedgerEntry, addFinancialReportEvent, addFinancialReportSettlement } from './financialReporting';
import { sanitizeDelegateDoc } from './workerReadHelpers';
import { getCairoDateKey, getCairoDayBounds } from './projections';

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

// Handler 9: Financial Summary Report (GET /api/financial-summary & GET /api/reports/financial)
const handleFinancialSummaryReport = async (c: any) => {
  try {
    const user = c.get('user');
    if (!canViewFinancialReport(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

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
    const todayDateKey = getCairoDateKey(now);
    const today = new Date(`${todayDateKey}T00:00:00.000Z`);
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
    const startAt = getCairoDayBounds(start).start;
    const endAt = getCairoDayBounds(end).start;
    // Domain events persist occurredAt as an ISO string, unlike settlement
    // records, whose settledAt field is a Firestore Timestamp/Date.
    const eventStartAt = startAt.toISOString();
    const eventEndAt = endAt.toISOString();
    let eventsQuery: any = adminDb.collectionGroup('events');
    let settlementsQuery: any = adminDb.collection('settlements');
    let creditLedgerQuery: any = adminDb.collection('credit_ledger');
    eventsQuery = eventsQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    settlementsQuery = settlementsQuery.where('settledAt', '>=', startAt).where('settledAt', '<', endAt);
    if (!delegateId) creditLedgerQuery = creditLedgerQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    const accumulator = createFinancialReportAccumulator({ start: startAt, end: endAt, delegateId });
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

