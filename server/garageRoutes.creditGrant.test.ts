import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGarageRoutes } from './garageRoutes';
import { getCairoDayBounds } from './projections';
import { parseMoneyAmount } from './money';

afterEach(() => {
  vi.restoreAllMocks();
});

function createCreditGrantHarness(options: { withDelegate?: boolean } = {}) {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      return app;
    }
  });

  let generatedRef = 0;
  const ref = (path: string) => ({ path, id: path.split('/').pop() });
  const garage: Record<string, any> = {
    id: 'garage-1',
    name: 'جراج الاختبار',
    billingModel: 'prepaid_credits',
    createdByDelegateId: options.withDelegate === false ? undefined : 'delegate-1',
    creditBalance: { paid: 0, referral: 0, trial: 0 }
  };
  const delegate: Record<string, any> = {
    id: 'delegate-1',
    totalCommissionEarned: 0,
    totalRechargedAmount: 0
  };
  const writes: Array<{ operation: string; path: string; data: any }> = [];
  const paymentReferenceMarkers = new Set<string>();
  const paymentReferenceMarkerData = new Map<string, any>();
  const transaction = {
    get: vi.fn(async (documentRef: any) => {
      if (documentRef.path === 'garages/garage-1') return { exists: true, data: () => ({ ...garage }) };
      if (documentRef.path === 'delegates/delegate-1') {
        return { exists: options.withDelegate !== false, data: () => ({ ...delegate }) };
      }
      if (documentRef.path === 'credit_referral_awards/garage-1') return { exists: false, data: () => undefined };
      if (documentRef.path.startsWith('payment_reference_markers/')) return { exists: paymentReferenceMarkers.has(documentRef.path), data: () => paymentReferenceMarkerData.get(documentRef.path) };
      if (documentRef.path.startsWith('packages/')) return { exists: false, data: () => undefined };
      return { exists: false, data: () => undefined };
    }),
    set: vi.fn((documentRef: any, data: any, merge?: any) => {
      writes.push({ operation: 'set', path: documentRef.path, data });
      if (documentRef.path.startsWith('payment_reference_markers/')) { paymentReferenceMarkers.add(documentRef.path); paymentReferenceMarkerData.set(documentRef.path, data); }
      if (documentRef.path === 'garages/garage-1') Object.assign(garage, merge ? data : data);
    }),
    update: vi.fn((documentRef: any, data: any) => {
      writes.push({ operation: 'update', path: documentRef.path, data });
      if (documentRef.path === 'delegates/delegate-1') Object.assign(delegate, data);
    }),
    delete: vi.fn()
  };

  const db = {
    doc: (path: string) => ref(path),
    collection: (name: string) => ({
      doc: (id?: string) => ref(`${name}/${id || `generated-${++generatedRef}`}`),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(async () => ({ size: 0, docs: [] }))
    }),
    runTransaction: vi.fn(async (callback: (t: any) => unknown) => callback(transaction))
  };

  const recordDomainEventInTransaction = vi.fn((_t: any, _db: any, event: any) => event);
  const grantPaidCredits = vi.fn(({ balance, amount, garageId, actorUid, actorRole, reason, reference, occurredAt, idempotencyKey }: any) => ({
    ok: true,
    value: {
      balance: { ...balance, paid: balance.paid + amount },
      entry: {
        garageId, kind: 'paid_grant', bucket: 'paid', amount,
        balanceBefore: balance.paid + balance.referral + balance.trial,
        balanceAfter: balance.paid + amount + balance.referral + balance.trial,
        actorUid, actorRole, reason, reference, occurredAt, idempotencyKey
      }
    }
  }));

  const dependencies: any = {
    getAdminDb: () => db,
    requireWorkerAuth: vi.fn(),
    enforceWorkerFinancialRateLimit: vi.fn(),
    canSubmitGarageApplication: () => true,
    sanitizePayload: (body: any) => body,
    validateString: (value: any) => value,
    validateNumber: (value: any) => Number(value),
    ValidationError: class extends Error {},
    validateNewPin: (value: any) => value,
    validateIdempotencyKey: (value: any) => value,
    computeLookupHash: () => 'pin-hash',
    checkPinAvailabilityAcrossAll: async () => ({ taken: false }),
    createRequestFingerprint: () => 'request-fingerprint',
    checkIdempotencyInTransaction: async () => ({ isDuplicate: false }),
    saveEntityPinInTransaction: vi.fn(),
    maintainedGarageSummaryRef: vi.fn(),
    maintainedAdminSummaryRef: vi.fn(() => ({ set: vi.fn(async () => undefined) })),
    MAINTAINED_SUMMARY_VERSION: 1,
    writeMaintainedAdminDelta: vi.fn(),
    storeIdempotencyInTransaction: vi.fn(),
    mapDomainErrorToStatus: (error: any) => ({ statusCode: 500, message: error?.message || 'SERVER_ERROR' }),
    parseMoneyAmount,
    parseFirestorePageRequest: vi.fn(),
    firestorePageStartAfter: vi.fn(),
    buildFirestorePage: vi.fn(),
    canRunGarageMaintenance: vi.fn(),
    validateId: (value: any) => value,
    getCairoDayBounds,
    reconcileGarageState: vi.fn(),
    isValidDateKey: vi.fn(),
    calculateDailyProjection: vi.fn(),
    aggregateProjectionBuckets: vi.fn(),
    reconcileDashboardSummary: vi.fn(),
    decideGarageScope: vi.fn(),
    isFreshDashboardSummary: vi.fn(),
    normalizeStoredDashboardMoney: vi.fn(),
    canManageStaffForGarage: vi.fn(),
    deleteEntityPinInTransaction: vi.fn(),
    canManageDelegates: vi.fn(),
    saveEntityPin: vi.fn(),
    canUpdateEntityPin: vi.fn(),
    validatePackageCatalogRecord: vi.fn(),
    grantPaidCredits,
    grantTrialCredits: vi.fn(),
    awardReferralCredits: vi.fn(),
    materializeCreditLedgerEntry: (entry: any) => ({ ok: true, value: { ...entry, entryId: 'credit-ledger-1' } }),
    recordDomainEventInTransaction,
    startGarageDeletionRoute: vi.fn(),
    advanceGarageDeletionRoute: vi.fn(),
    readGarageDeletionStatusRoute: vi.fn()
  };

  registerGarageRoutes(app, dependencies);
  return {
    route: routes.get('POST /api/garages/:id/credit-grants')!,
    garage,
    delegate,
    writes,
    transaction,
    recordDomainEventInTransaction,
    grantPaidCredits
  };
}

function requestContext(body: Record<string, unknown>) {
  return {
    get: (key: string) => key === 'user' ? { role: 'admin', uid: 'admin-1', displayName: 'Admin' } : undefined,
    req: {
      param: () => 'garage-1',
      json: async () => body,
      header: () => undefined
    },
    json: (responseBody: unknown, status = 200) => ({ body: responseBody, status })
  };
}

function grantBody(amount: number, idempotencyKey: string) {
  return {
    paymentConfirmed: true,
    reason: 'تأكيد دفع اختبار',
    amount,
    paymentAmountEgp: amount,
    idempotencyKey
  };
}

describe('first paid credit grant delegate commission', () => {
  it('records exactly one 100 EGP commission and updates lifetime and unsettled totals', async () => {
    const harness = createCreditGrantHarness();
    const first = await harness.route(requestContext(grantBody(500, 'grant-first')));
    expect(first.status).toBe(200);
    expect(harness.delegate.totalCommissionEarned).toBe(100);
    expect(harness.delegate.totalRechargedAmount).toBe(100);

    const commissionEvents = harness.recordDomainEventInTransaction.mock.calls
      .map((call) => call[2])
      .filter((event) => event.eventType === 'commission_earned');
    expect(commissionEvents).toHaveLength(1);
    expect(commissionEvents[0]).toMatchObject({
      garageId: 'garage-1',
      aggregateType: 'delegate',
      aggregateId: 'delegate-1',
      eventType: 'commission_earned',
      idempotencyKey: 'first_paid_grant_commission:garage-1',
      payload: {
        delegateId: 'delegate-1',
        commissionAmount: 100,
        sourceCreditGrantId: 'credit-ledger-1'
      }
    });

    // Payment references were removed; the second grant succeeds (different
    // idempotency key), and the qualifying-grant marker is already set so no
    // second commission fires.
    const second = await harness.route(requestContext({ ...grantBody(50, 'grant-second') }));
    expect(second.status).toBe(200);
    expect(harness.delegate.totalCommissionEarned).toBe(100);
    expect(harness.delegate.totalRechargedAmount).toBe(100);
    expect(harness.recordDomainEventInTransaction.mock.calls.map((call) => call[2]).filter((event) => event.eventType === 'commission_earned')).toHaveLength(1);
  });

  it('does not award commission to garages without a delegate owner', async () => {
    const harness = createCreditGrantHarness({ withDelegate: false });
    const response = await harness.route(requestContext(grantBody(500, 'grant-no-delegate')));

    expect(response.status).toBe(200);
    expect(harness.recordDomainEventInTransaction.mock.calls.map((call) => call[2]).filter((event) => event.eventType === 'commission_earned')).toHaveLength(0);
  });

  it('rolls back a first paid grant when its recorded delegate is missing', async () => {
    const harness = createCreditGrantHarness({ withDelegate: false });
    harness.garage.createdByDelegateId = 'delegate-1';
    const response = await harness.route(requestContext(grantBody(500, 'grant-missing-delegate')));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ success: false, error: 'DELEGATE_NOT_FOUND' });
    expect(harness.writes).toHaveLength(0);
    expect(harness.grantPaidCredits).not.toHaveBeenCalled();
  });
});

