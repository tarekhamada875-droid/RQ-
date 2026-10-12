import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { api } from '../../server/api';

describe('CF7 — Cloudflare Worker Financial, Recharge & Reporting Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf7';
  const testDelegateId = 'worker-test-delegate-cf7';

  beforeEach(async () => {
    mockDb.clear();
    mockDb.seed(`garages/${testGarageId}`, {
      name: 'Financial Test Garage',
      balance: 100,
      balanceExpiry: '2026-10-01',
      dailyCapacity: 50,
      isTrial: false,
      createdByDelegateId: testDelegateId
    });

    mockDb.seed(`delegates/${testDelegateId}`, {
      name: 'Financial Delegate',
      phone: '01012345678',
      totalRechargedAmount: 500,
      totalCommissionEarned: 100
    });

    mockDb.seed('packages/pkg_monthly_standard', {
      id: 'pkg_monthly_standard',
      name: 'باقة شهرية standard',
      price: 500,
      basePrice: 500,
      discountAmount: 0,
      finalPrice: 500,
      durationDays: 30,
      dailyCapacity: 50,
      isUnlimited: false,
      isActive: true
    });
  });

  it('1. POST /api/recharge-requests/create creates pending request', async () => {
    const unauthRes = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId: testGarageId })
    }));
    expect(unauthRes.status).toBe(401);

    const key = 'garage_recharge_request_001';
    const createRes = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer valid-garage-token-${testGarageId}`
      },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'pkg_monthly_standard',
        requestType: 'subscription',
        amount: 999999,
        packageName: 'client-controlled package name',
        delegateId: 'client-controlled-delegate',
        externalReference: 'client-controlled-reference',
        notes: 'client-controlled notes',
        idempotencyKey: key
      })
    }), workerEnv);

    expect(createRes.status).toBe(200);
    const body = await createRes.json() as any;
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
    expect(body.data).toMatchObject({
      requestId: body.id,
      garageId: testGarageId,
      packageId: 'pkg_monthly_standard',
      requestType: 'subscription',
      status: 'pending',
      idempotencyKey: key
    });
    expect(body.data).not.toHaveProperty('amount');
    expect(body.data).not.toHaveProperty('packageName');
    expect(body.data).not.toHaveProperty('delegateId');
    expect(body.data).not.toHaveProperty('externalReference');
    expect(body.data).not.toHaveProperty('notes');
    expect(mockDb.records.get(`recharge_requests/${body.id}`)).toMatchObject({
      requestId: body.id,
      garageId: testGarageId,
      packageId: 'pkg_monthly_standard',
      requestType: 'subscription',
      status: 'pending',
      idempotencyKey: key
    });
    expect(mockDb.records.get(`recharge_requests/${body.id}`)?.createdAt).toBeInstanceOf(Date);
  });

  it('denies Admin, Staff, and cross-garage callers from creating recharge requests', async () => {
    const cases = [
      ['valid-admin-token', testGarageId],
      [`valid-staff-token-${testGarageId}`, testGarageId],
      ['valid-garage-token-another-garage', testGarageId]
    ];

    for (const [token, garageId] of cases) {
      const response = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ garageId, packageId: 'pkg_monthly_standard', idempotencyKey: `denied_key_${String(token).slice(-8)}` })
      }), workerEnv);
      expect(response.status).toBe(403);
    }

    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(0);
  });

  it('allows a delegate request only for a garage it created or referred', async () => {
    const delegateGarageId = 'worker-test-delegate-garage-cf7';
    mockDb.seed(`garages/${delegateGarageId}`, { name: 'Delegate Garage', createdByDelegateId: 'delegate-a' });
    const allowed = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-delegate-token-delegate-a' },
      body: JSON.stringify({ garageId: delegateGarageId, packageId: 'pkg_monthly_standard', idempotencyKey: 'delegate_recharge_request_1' })
    }), workerEnv);
    expect(allowed.status).toBe(200);
    const allowedBody = await allowed.json() as any;
    expect(allowedBody.data).toMatchObject({ delegateId: 'delegate-a', garageName: 'Delegate Garage' });

    const denied = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-delegate-token-delegate-a' },
      body: JSON.stringify({ garageId: testGarageId, packageId: 'pkg_monthly_standard', idempotencyKey: 'delegate_recharge_request_2' })
    }), workerEnv);
    expect(denied.status).toBe(403);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(1);
  });

  it('validates required idempotency, request type, and wallet amount before writing', async () => {
    const request = (body: Record<string, unknown>) => api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-garage-token-${testGarageId}` },
      body: JSON.stringify({ garageId: testGarageId, packageId: 'pkg_monthly_standard', ...body })
    }), workerEnv);

    expect((await request({})).status).toBe(400);
    expect((await request({ requestType: 'forged', idempotencyKey: 'invalid_request_type_1' })).status).toBe(400);
    expect((await request({ requestType: 'balance_topup', amount: 0, idempotencyKey: 'invalid_topup_amount_1' })).status).toBe(400);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(0);
  });

  it('stores only a validated amount for a balance-top-up request', async () => {
    const response = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-garage-token-${testGarageId}` },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'balance_topup',
        requestType: 'balance_topup',
        amount: 250,
        revenueAmount: 999999,
        durationDays: 365,
        idempotencyKey: 'garage_balance_topup_request_1'
      })
    }), workerEnv);
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ requestType: 'balance_topup', packageId: 'balance_topup', amount: 250 });
    expect(body.data).not.toHaveProperty('revenueAmount');
    expect(body.data).not.toHaveProperty('durationDays');
  });

  it('replays the same request and rejects idempotency-key reuse with a changed payload', async () => {
    const key = 'garage_recharge_replay_001';
    const create = (couponCode: string) => api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-garage-token-${testGarageId}` },
      body: JSON.stringify({ garageId: testGarageId, packageId: 'pkg_monthly_standard', couponCode, idempotencyKey: key })
    }), workerEnv);

    const first = await create('SAVE10');
    const firstBody = await first.json() as any;
    const replay = await create('SAVE10');
    const replayBody = await replay.json() as any;
    const conflict = await create('SAVE20');

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replayBody.id).toBe(firstBody.id);
    expect(conflict.status).toBe(409);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(1);
  });

  it('serializes concurrent duplicate requests to one recharge record', async () => {
    const create = () => api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-garage-token-${testGarageId}` },
      body: JSON.stringify({ garageId: testGarageId, packageId: 'pkg_monthly_standard', idempotencyKey: 'garage_recharge_concurrent_1' })
    }), workerEnv);

    const responses = await Promise.all([create(), create(), create()]);
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<any>));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(new Set(bodies.map((body) => body.id)).size).toBe(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(1);
  });

  it('applies the shared 30-request financial rate limit to recharge creation', async () => {
    const create = (index: number) => api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-garage-token-${testGarageId}` },
      body: JSON.stringify({ garageId: testGarageId, packageId: 'pkg_monthly_standard', idempotencyKey: `garage_recharge_limiter_${index}` })
    }), workerEnv);

    const responses: Response[] = [];
    for (let index = 0; index < 31; index += 1) responses.push(await create(index));
    expect(responses.slice(0, 30).every((response) => response.status === 200)).toBe(true);
    expect(responses[30].status).toBe(429);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(30);
  });

  it('2. POST /api/recharge-requests/process approves recharge and grants subscription', async () => {
    // Create request first
    const createRes = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer valid-garage-token-${testGarageId}`
      },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'pkg_monthly_standard',
        requestType: 'subscription',
        idempotencyKey: 'approval_test_request_1'
      })
    }), workerEnv);

    const createBody = await createRes.json() as any;
    const requestId = createBody.id;
    const testIdempKey = `idemp_appr_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Process/Approve (using admin token)
    const processRes = await api.fetch(new Request('http://localhost/api/recharge-requests/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        requestId,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(processRes.status).toBe(200);
    const processBody = await processRes.json() as any;
    expect(processBody.success).toBe(true);
    expect(processBody.data.status).toBe('approved');
  });

  it('3. POST /api/recharge-requests/reject rejects pending request', async () => {
    // Create request first
    const createRes = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer valid-garage-token-${testGarageId}`
      },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'pkg_monthly_standard',
        requestType: 'subscription',
        idempotencyKey: 'rejection_test_request_1'
      })
    }), workerEnv);

    const createBody = await createRes.json() as any;
    const requestId = createBody.id;
    const testIdempKey = `idemp_rej_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Reject
    const rejectRes = await api.fetch(new Request('http://localhost/api/recharge-requests/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        requestId,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(rejectRes.status).toBe(200);
    const rejectBody = await rejectRes.json() as any;
    expect(rejectBody.success).toBe(true);
  });

  it('4. POST /api/transactions/admin-topup-balance adds direct wallet credit', async () => {
    const testIdempKey = `idemp_topup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const topupRes = await api.fetch(new Request('http://localhost/api/transactions/admin-topup-balance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        garageId: testGarageId,
        amount: 200,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(topupRes.status).toBe(200);
    const topupBody = await topupRes.json() as any;
    expect(topupBody.success).toBe(true);
    expect(topupBody.data.newBalance).toBe(300);
  });

  it('5. POST /api/delegate/withdraw-commission settles delegate account', async () => {
    const testIdempKey = `idemp_settle_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const settleRes = await api.fetch(new Request('http://localhost/api/delegate/withdraw-commission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        id: testDelegateId,
        idempotencyKey: testIdempKey
      })
    }), workerEnv);

    expect(settleRes.status).toBe(200);
    const settleBody = await settleRes.json() as any;
    expect(settleBody.success).toBe(true);
    expect(settleBody.settlementId).toBeDefined();
  });

  it('6. GET /api/financial-summary returns aggregated financial totals', async () => {
    const summaryRes = await api.fetch(new Request('http://localhost/api/financial-summary', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(summaryRes.status).toBe(200);
    const summaryBody = await summaryRes.json() as any;
    expect(summaryBody.success).toBe(true);
    expect(summaryBody.data.report).toBeDefined();
    expect(typeof summaryBody.data.report.grossRechargeTotal).toBe('number');
  });
});
