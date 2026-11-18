import { afterEach, describe, expect, it, vi } from 'vitest';

// Per-garage pricing (owner decision 2026-11-18): approving a delegate credit
// request must convert the collected EGP with THIS garage's price — the same
// selection + rounding as /api/garages/:id/credit-grants (override wins,
// global system_config rate falls back, corrupt rates fail closed). The old
// approval behavior granted request.amount credits 1:1 and recorded revenue
// that contradicted pinned prices.

vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    doc: vi.fn(),
    collection: vi.fn(),
    runTransaction: vi.fn(),
    getAll: vi.fn(),
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
  grantPaidCredits: vi.fn(({ balance, amount, garageId, actorUid, actorRole, reason, occurredAt, idempotencyKey }: any) => ({
    ok: true,
    value: {
      balance: { ...balance, paid: (balance?.paid ?? 0) + amount },
      entry: {
        garageId, kind: 'paid_grant', bucket: 'paid', amount,
        balanceBefore: balance?.paid ?? 0,
        balanceAfter: (balance?.paid ?? 0) + amount,
        actorUid, actorRole, reason, occurredAt, idempotencyKey
      }
    }
  })),
  materializeCreditLedgerEntry: vi.fn((entry: any) => ({ ok: true, value: { ...entry, entryId: 'credit-ledger-1' } })),
  grantTrialCredits: vi.fn(),
  awardReferralCredits: vi.fn(),
  applyCorrection: vi.fn(),
}));

import { registerCreditRequestRoutes } from './creditRequestRoutes';
import { adminDb } from './firebaseAdmin';
import { recordDomainEventInTransaction } from './events';
import { grantPaidCredits } from './domain/prepaidCreditLedger';

afterEach(() => vi.clearAllMocks());

const grantPaidCreditsMock = vi.mocked(grantPaidCredits);
const recordDomainEventMock = vi.mocked(recordDomainEventInTransaction);

function createHarness(options: { globalConfig?: { creditRate?: number } | null; garageOverride?: number } = {}) {
  const routes = new Map<string, (context: any) => Promise<any>>();
  const app: any = new Proxy({}, {
    get: (_target, method: string | symbol) => (path: string, ...handlers: unknown[]) => {
      const handler = handlers[handlers.length - 1];
      if (typeof handler === 'function') routes.set(`${String(method).toUpperCase()} ${path}`, handler as (context: any) => Promise<any>);
      return app;
    }
  });

  const garage: Record<string, any> = {
    id: 'garage-1',
    name: 'جراج الاختبار',
    billingModel: 'prepaid_credits',
    createdByDelegateId: 'delegate-1',
    credits: 0,
    totalAdminRevenue: 0,
    ...(options.garageOverride !== undefined ? { creditRateOverride: options.garageOverride } : {}),
  };
  const requestDoc: Record<string, any> = {
    garageId: 'garage-1',
    garageName: 'جراج الاختبار',
    delegateId: 'delegate-1',
    delegateName: 'المندوب الأول',
    amount: 100,
    status: 'pending',
  };
  const delegate: Record<string, any> = { id: 'delegate-1', totalCommissionEarned: 0, totalRechargedAmount: 0 };
  const writes: Array<{ operation: string; path: string; data: any }> = [];

  const transaction = {
    get: vi.fn(async (ref: any) => {
      if (ref.path === 'credit_requests/req-1') return { exists: true, data: () => ({ ...requestDoc }) };
      if (ref.path === 'garages/garage-1') return { exists: true, data: () => ({ ...garage }) };
      if (ref.path === 'delegates/delegate-1') return { exists: true, data: () => ({ ...delegate }) };
      if (ref.path === 'system_config/global') {
        return options.globalConfig === null
          ? { exists: false, data: () => undefined }
          : { exists: true, data: () => ({ ...(options.globalConfig || {}) }) };
      }
      return { exists: false, data: () => undefined };
    }),
    set: vi.fn((ref: any, data: any) => { writes.push({ operation: 'set', path: ref.path, data }); }),
    update: vi.fn((ref: any, data: any) => { writes.push({ operation: 'update', path: ref.path, data }); }),
    delete: vi.fn(),
  };

  const pendingDocs = [
    { id: 'req-1', garageId: 'garage-1', garageName: 'جراج الاختبار', delegateId: 'delegate-1', delegateName: 'المندوب الأول', amount: 100, status: 'pending' },
    { id: 'req-2', garageId: 'garage-2', garageName: 'جراج آخر', delegateId: 'delegate-1', delegateName: 'المندوب الأول', amount: 100, status: 'pending' },
  ];

  const snapshotFor = (path: string) => {
    if (path === 'system_config/global') {
      return options.globalConfig === null
        ? { exists: false, data: () => undefined }
        : { exists: true, data: () => ({ ...(options.globalConfig || {}) }) };
    }
    if (path === 'garages/garage-1') return { exists: true, data: () => ({ ...garage }) };
    return { exists: false, data: () => undefined };
  };

  const db = {
    doc: (path: string) => ({ path, get: async () => snapshotFor(path) }),
    collection: (name: string) => ({
      doc: (id?: string) => ({ path: id ? `${name}/${id}` : `${name}/generated` }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn(async () => ({ docs: pendingDocs.map(d => ({ id: d.id, data: () => ({ ...d }) })) })),
    }),
    runTransaction: vi.fn(async (cb: (t: any) => unknown) => cb(transaction)),
    getAll: vi.fn(async (...refs: any[]) => refs.map((r: any) => (
      r.path === 'garages/garage-1' ? { exists: true, data: () => ({ ...garage }) } : { exists: false, data: () => undefined }
    ))),
  };

  (adminDb.doc as any).mockImplementation((path: string) => db.doc(path));
  (adminDb.collection as any).mockImplementation((name: string) => db.collection(name));
  (adminDb.runTransaction as any).mockImplementation((cb: any) => db.runTransaction(cb));
  (adminDb.getAll as any).mockImplementation((...refs: any[]) => db.getAll(...refs));

  registerCreditRequestRoutes(app);

  return {
    approve: routes.get('POST /api/admin/credit-requests/:id/approve')!,
    list: routes.get('GET /api/admin/credit-requests')!,
    garage,
    requestDoc,
    delegate,
    writes,
    transaction,
  };
}

function adminContext(overrides: Partial<{ requestId: string; query: (name: string) => string }> = {}) {
  return {
    get: (key: string) => key === 'user' ? { role: 'admin', uid: 'admin-1', displayName: 'Admin' } : undefined,
    req: {
      param: () => overrides.requestId || 'req-1',
      query: overrides.query || (() => ''),
      json: async () => ({}),
      header: () => undefined,
    },
    json: (responseBody: unknown, status = 200) => ({ body: responseBody, status }),
  };
}

describe('per-garage price applied to credit-request approval (owner decision 2026-11-18)', () => {
  it('converts the collected EGP with the garage creditRateOverride — override wins', async () => {
    const harness = createHarness({ garageOverride: 2, globalConfig: { creditRate: 1 } }); // override beats global 1.0
    const response = await harness.approve(adminContext());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, creditsGranted: 200, paymentAmountEgp: 100 });
    expect(grantPaidCreditsMock.mock.calls[0][0]).toMatchObject({ garageId: 'garage-1', amount: 200 });

    // Ledger records the real conversion: credits granted + EGP collected.
    const ledgerWrite = harness.writes.find((w) => w.path === 'credit_ledger/credit-ledger-1');
    expect(ledgerWrite).toBeDefined();
    expect(ledgerWrite!.data.paymentAmountEgp).toBe(100);
    expect(ledgerWrite!.data.amount).toBe(200);

    // Revenue records the EGP collected, not the derived credits.
    const garageWrite = harness.writes.find((w) => w.path === 'garages/garage-1' && w.operation === 'set');
    expect(garageWrite!.data.totalAdminRevenue).toBe(100);
  });

  it('falls back to the global system_config rate when the garage has no override', async () => {
    const harness = createHarness({ globalConfig: { creditRate: 1.33 } });
    const response = await harness.approve(adminContext());

    expect(response.status).toBe(200);
    expect(response.body.creditsGranted).toBe(133); // round(100 × 1.33)
    expect(grantPaidCreditsMock.mock.calls[0][0]).toMatchObject({ amount: 133 });
  });

  it('fails closed on a corrupt override instead of granting with a broken rate', async () => {
    const harness = createHarness({ garageOverride: 0 });
    const response = await harness.approve(adminContext());

    expect(response.body).toMatchObject({ success: false });
    expect(String(response.body.error)).toContain('INVALID_CREDIT_RATE_CONFIG');
    expect(harness.writes).toHaveLength(0);
    expect(grantPaidCreditsMock).not.toHaveBeenCalled();
  });

  it('still fires the delegate commission on the EGP collected (≥500), even when credits derived are higher', async () => {
    const harness = createHarness({ garageOverride: 2, globalConfig: { creditRate: 1 } });
    harness.requestDoc.amount = 500;
    const response = await harness.approve(adminContext());

    expect(response.status).toBe(200);
    expect(response.body.creditsGranted).toBe(1000); // 500 EGP × 2 credits/EGP

    const commissionEvents = recordDomainEventMock.mock.calls
      .map((call) => call[2])
      .filter((event) => event.eventType === 'commission_earned');
    expect(commissionEvents).toHaveLength(1);
    const delegateUpdate = harness.writes.find((w) => w.path === 'delegates/delegate-1' && w.operation === 'update');
    expect(delegateUpdate).toBeDefined();
    expect(delegateUpdate!.data.totalCommissionEarned).toBe(100);
  });
});

describe('pending credit-request list credits preview', () => {
  it('attaches a per-request credits preview using each garage\'s price', async () => {
    const harness = createHarness({
      garageOverride: 2,
      globalConfig: { creditRate: 1.33 },
    });
    const response = await harness.list(adminContext({
      query: (name: string) => (name === 'status' ? 'pending' : ''),
    }));

    expect(response.status).toBe(200);
    const requests = response.body.requests as Array<{ id: string; creditsPreview?: number }>;
    // garage-1 has override 2 → 100 EGP → 200 credits
    expect(requests[0]).toMatchObject({ id: 'req-1', creditsPreview: 200 });
    // garage-2 is missing from the DB → falls back to the global 1.33
    expect(requests[1]).toMatchObject({ id: 'req-2', creditsPreview: 133 });
  });
});
