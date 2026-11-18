import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the modules that creditGrantRoutes imports directly.
vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(),
    doc: vi.fn(),
    runTransaction: vi.fn(),
  },
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }), delete: () => ({ __op: 'delete' }) },
}));
vi.mock('./sessionInfrastructure', () => ({
  requireWorkerAuth: vi.fn((_c, next) => next()),
  sessionIndexPath: () => '',
}));
vi.mock('./events', () => ({
  recordDomainEventInTransaction: vi.fn((_t: any, _db: any, event: any) => event),
}));
vi.mock('./domain/prepaidCreditLedger', () => ({
  grantPaidCredits: vi.fn(({ balance, amount, garageId, actorUid, actorRole, reason, reference, occurredAt, idempotencyKey }: any) => ({
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
  })),
  materializeCreditLedgerEntry: vi.fn((entry: any) => ({ ok: true, value: { ...entry, entryId: 'credit-ledger-1' } })),
  grantTrialCredits: vi.fn(),
  awardReferralCredits: vi.fn(),
  applyCorrection: vi.fn(),
}));

import { registerCreditGrantRoutes } from './creditGrantRoutes';
import { adminDb } from './firebaseAdmin';
import { recordDomainEventInTransaction } from './events';
import { grantPaidCredits } from './domain/prepaidCreditLedger';

afterEach(() => vi.clearAllMocks());

const recordDomainEventMock = vi.mocked(recordDomainEventInTransaction);
const grantPaidCreditsMock = vi.mocked(grantPaidCredits);

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

  // Wire the mocked adminDb to return our test db.
  (adminDb.collection as any).mockImplementation((name: string) => db.collection(name));
  (adminDb.doc as any).mockImplementation((path: string) => {
    const parts = path.split('/');
    const coll = parts[0];
    const id = parts[1];
    return db.collection(coll).doc(id);
  });
  (adminDb.runTransaction as any).mockImplementation((callback: (t: any) => unknown) => db.runTransaction(callback));

  registerCreditGrantRoutes(app);

  return {
    route: routes.get('POST /api/garages/:id/credit-grants')!,
    garage,
    delegate,
    writes,
    transaction,
    recordDomainEventInTransaction: recordDomainEventMock,
    grantPaidCredits: grantPaidCreditsMock
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
      idempotencyKey: 'grant-first:commission',
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

  it('stamps lastCreditGrantAt on the garage doc so the dashboard badge can read it without an activity_logs subscription', async () => {
    // Audit ref: Option 2 ("buzzer on the microwave"), 2026-11-08.
    // The Worker must mirror the activity_log 'credit_grant' timestamp onto
    // the garage doc in the SAME transaction that writes the activity_log.
    // Otherwise the client can't tear down its always-on activity_logs
    // listener (the badge would stop firing).
    const harness = createCreditGrantHarness();
    const response = await harness.route(requestContext(grantBody(500, 'grant-stamp')));
    expect(response.status).toBe(200);

    const garageWrites = harness.writes.filter((w) => w.path === 'garages/garage-1' && w.operation === 'set');
    expect(garageWrites.length).toBeGreaterThan(0);
    const stampWrite = garageWrites.find((w) => w.data && typeof w.data.lastCreditGrantAt !== 'undefined');
    expect(stampWrite).toBeDefined();
    expect(stampWrite!.data.lastCreditGrantAt).toBeInstanceOf(Date);
  });
});

describe('per-garage credit rate override in the grant transaction (owner decision 2026-11-18)', () => {
  it('converts EGP with the garage creditRateOverride when one is pinned', async () => {
    const harness = createCreditGrantHarness();
    harness.garage.creditRateOverride = 2; // 0.5 EGP per credit
    const response = await harness.route(requestContext(grantBody(100, 'grant-override')));
    expect(response.status).toBe(200);
    // 100 EGP x 2 credits/EGP = 200 credits, regardless of the global rate.
    expect(harness.grantPaidCredits).toHaveBeenCalled();
    expect(grantPaidCreditsMock.mock.calls[0][0]).toMatchObject({ garageId: 'garage-1', amount: 200 });
  });

  it('falls back to the global system_config rate when the garage has no override', async () => {
    const harness = createCreditGrantHarness();
    // This harness serves system_config/global as non-existent, so the global
    // rate falls back to the legacy default 1 (1 EGP = 1 credit).
    const response = await harness.route(requestContext(grantBody(100, 'grant-global-fallback')));
    expect(response.status).toBe(200);
    expect(grantPaidCreditsMock.mock.calls[0][0]).toMatchObject({ garageId: 'garage-1', amount: 100 });
  });

  it('rejects a corrupt override instead of granting with a broken rate', async () => {
    const harness = createCreditGrantHarness();
    harness.garage.creditRateOverride = 0; // invalid — must fail closed
    const response = await harness.route(requestContext(grantBody(100, 'grant-bad-override')));
    expect(response.status).toBe(400);
    expect(harness.grantPaidCredits).not.toHaveBeenCalled();
  });
});

describe('POST /api/garages/:id/credit-rate (admin-only per-garage pricing)', () => {
  function createCreditRateHarness(initialGarage: Record<string, any>) {
    const routes = new Map<string, (context: any) => Promise<any>>();
    const app: any = new Proxy({}, {
      get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
        const handler = handlers[handlers.length - 1];
        if (typeof handler === 'function') routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
        return app;
      }
    });

    const store = new Map<string, Record<string, any>>([
      ['garages/garage-1', { ...initialGarage }],
    ]);

    (adminDb.doc as any).mockImplementation((path: string) => ({
      path,
      id: path.split('/').pop(),
      get: async () => ({ exists: store.has(path), data: () => ({ ...(store.get(path) || {}) }) }),
      update: async (data: any) => {
        const current = store.get(path);
        if (!current) throw new Error('No such document');
        Object.assign(current, data);
      },
    }));

    registerCreditGrantRoutes(app);
    return { route: routes.get('POST /api/garages/:id/credit-rate')!, store };
  }

  function rateRequestContext(body: Record<string, unknown>, role = 'admin') {
    return {
      get: (key: string) => key === 'user' ? { role, uid: 'admin-1', displayName: 'Admin' } : undefined,
      req: {
        param: () => 'garage-1',
        json: async () => body,
        header: () => undefined
      },
      json: (responseBody: unknown, status = 200) => ({ body: responseBody, status })
    };
  }

  const prepaidGarage = { id: 'garage-1', name: 'جراج الاختبار', billingModel: 'prepaid_credits' };

  it('pins a preset price: stores the inverse as creditRateOverride', async () => {
    const harness = createCreditRateHarness(prepaidGarage);
    const response = await harness.route(rateRequestContext({ egpPerCredit: 0.75 }));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, cleared: false });
    expect(response.body.creditRate).toBeCloseTo(1 / 0.75, 12);
    const stored = harness.store.get('garages/garage-1')!;
    expect(stored.creditRateOverride).toBeCloseTo(1 / 0.75, 12);
    expect(stored.updatedAt).toBeInstanceOf(Date);
  });

  it('clears the override so the garage follows the global rate again', async () => {
    const harness = createCreditRateHarness({ ...prepaidGarage, creditRateOverride: 1.33 });
    const response = await harness.route(rateRequestContext({ clear: true }));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, cleared: true });
    const stored = harness.store.get('garages/garage-1')!;
    expect(stored.creditRateOverride).toEqual({ __op: 'delete' }); // FieldValue.delete() sentinel
  });

  it('rejects non-admin callers', async () => {
    const harness = createCreditRateHarness(prepaidGarage);
    const response = await harness.route(rateRequestContext({ egpPerCredit: 0.75 }, 'garage'));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, error: 'ADMIN_ONLY' });
  });

  it('returns 404 for an unknown garage', async () => {
    const harness = createCreditRateHarness(prepaidGarage);
    const context = rateRequestContext({ egpPerCredit: 0.75 });
    context.req.param = () => 'garage-404';
    const response = await harness.route(context);
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: 'GARAGE_NOT_FOUND' });
  });

  it('rejects subscription garages and out-of-range prices', async () => {
    const harness = createCreditRateHarness({ ...prepaidGarage, billingModel: 'subscription' });
    const response = await harness.route(rateRequestContext({ egpPerCredit: 0.75 }));
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, error: 'GARAGE_NOT_PREPAID' });

    const harness2 = createCreditRateHarness(prepaidGarage);
    const zero = await harness2.route(rateRequestContext({ egpPerCredit: 0 }));
    expect(zero.status).toBe(400);
    const huge = await harness2.route(rateRequestContext({ egpPerCredit: 5000 }));
    expect(huge.status).toBe(400);
  });
});
