import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';

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
import { calculateFinancialReport } from '../../server/financialReporting';
installDefaultWorkerTestSessionHeaders(api, mockDb);

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

  it('pages Admin and delegate recharge-request lists with filters and strict role scopes', async () => {
    for (let index = 0; index < 6; index += 1) {
      mockDb.seed(`recharge_requests/admin-page-${index}`, {
        status: index === 5 ? 'approved' : 'pending',
        createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000),
        delegateId: 'delegate-uid',
        garageId: `garage-${index}`
      });
    }
    mockDb.resetDocumentCounts();
    const adminPage = (cursor?: string) => {
      const params = new URLSearchParams({ limit: '2', status: 'pending' });
      if (cursor) params.set('cursor', cursor);
      return api.fetch(new Request(`http://localhost/api/recharge-requests?${params}`, {
        headers: { Authorization: 'Bearer valid-admin-token' }
      }), workerEnv);
    };
    const firstResponse = await adminPage();
    const first = await firstResponse.json() as any;
    expect(firstResponse.status).toBe(200);
    expect(first.requests).toHaveLength(2);
    expect(first.requests.every((request: any) => request.status === 'pending')).toBe(true);
    expect(first.hasMore).toBe(true);
    expect(mockDb.queryResultSizes.at(-1)).toBe(3);
    const secondResponse = await adminPage(first.nextCursor);
    const second = await secondResponse.json() as any;
    expect([...first.requests, ...second.requests]).toHaveLength(4);
    expect(new Set([...first.requests, ...second.requests].map((request: any) => request.id)).size).toBe(4);
    expect(second.hasMore).toBe(true);
    const finalResponse = await adminPage(second.nextCursor);
    const final = await finalResponse.json() as any;
    expect(final.requests).toHaveLength(1);
    expect(final.hasMore).toBe(false);
    expect([...first.requests, ...second.requests, ...final.requests]).toHaveLength(5);

    const delegatePage = await api.fetch(new Request('http://localhost/api/recharge-requests/my?limit=2', {
      headers: { Authorization: 'Bearer valid-delegate-token' }
    }), workerEnv);
    const delegateBody = await delegatePage.json() as any;
    expect(delegatePage.status).toBe(200);
    expect(delegateBody.requests).toHaveLength(2);
    expect(delegateBody.requests.every((request: any) => request.delegateId === 'delegate-uid')).toBe(true);
    expect(delegateBody.hasMore).toBe(true);
    expect(mockDb.queryResultSizes.at(-1)).toBe(3);
  });

  it('bounds delegate dashboard child lists and continues a selected section without duplicate rows', async () => {
    mockDb.seed('delegates/delegate-uid', { name: 'Paginated Delegate' });
    for (let index = 0; index < 5; index += 1) {
      mockDb.seed(`garages/created-${index}`, { createdByDelegateId: 'delegate-uid', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
      mockDb.seed(`garages/referred-${index}`, { referrerId: 'delegate-uid', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
      mockDb.seed(`recharge_requests/delegate-page-${index}`, { delegateId: 'delegate-uid', status: 'approved', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
    }
    mockDb.resetDocumentCounts();

    const response = await api.fetch(new Request('http://localhost/api/delegates/dashboard?limit=2', {
      headers: { Authorization: 'Bearer valid-delegate-token' }
    }), workerEnv);
    const first = await response.json() as any;
    expect(response.status).toBe(200);
    expect(first.garages).toHaveLength(4);
    expect(first.requests).toHaveLength(2);
    expect(first.pagination.createdGarages.hasMore).toBe(true);
    expect(first.pagination.referredGarages.hasMore).toBe(true);
    expect(first.pagination.requests.hasMore).toBe(true);
    expect(mockDb.queryResultSizes.slice(-3)).toEqual([3, 3, 3]);

    const params = new URLSearchParams({ section: 'requests', limit: '2', cursor: first.pagination.requests.nextCursor });
    const nextResponse = await api.fetch(new Request(`http://localhost/api/delegates/dashboard?${params}`, {
      headers: { Authorization: 'Bearer valid-delegate-token' }
    }), workerEnv);
    const next = await nextResponse.json() as any;
    expect(nextResponse.status).toBe(200);
    expect(next.requests).toHaveLength(2);
    expect(next.requests.map((request: any) => request.id)).not.toEqual(expect.arrayContaining(first.requests.map((request: any) => request.id)));
    expect(next.hasMore).toBe(true);
    expect(mockDb.queryResultSizes.at(-1)).toBe(3);
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

  it('blocks a second pending request, detects legacy pending records, and releases the guard after rejection', async () => {
    const create = (idempotencyKey: string) => api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-garage-token-${testGarageId}` },
      body: JSON.stringify({ garageId: testGarageId, packageId: 'pkg_monthly_standard', idempotencyKey })
    }), workerEnv);

    const first = await create('pending_guard_first');
    const firstBody = await first.json() as any;
    expect(first.status).toBe(200);
    expect(mockDb.records.get(`recharge_request_guards/${testGarageId}`)).toMatchObject({
      initialized: true,
      activeRequestId: firstBody.id
    });

    const duplicate = await create('pending_guard_second');
    expect(duplicate.status).toBe(409);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(1);

    const rejected = await api.fetch(new Request('http://localhost/api/recharge-requests/reject', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
        'x-idempotency-key': 'pending_guard_reject'
      },
      body: JSON.stringify({ requestId: firstBody.id, idempotencyKey: 'pending_guard_reject' })
    }), workerEnv);
    expect(rejected.status).toBe(200);
    expect(mockDb.records.get(`recharge_request_guards/${testGarageId}`)).toMatchObject({
      initialized: true,
      activeRequestId: null
    });

    const second = await create('pending_guard_after_reject');
    expect(second.status).toBe(200);
  });

  it('blocks creation when an old pending request exists before guard documents were introduced', async () => {
    mockDb.seed('recharge_requests/legacy_pending_for_garage', {
      garageId: testGarageId,
      status: 'pending',
      createdAt: new Date('2026-10-01T00:00:00Z')
    });

    const response = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-garage-token-${testGarageId}` },
      body: JSON.stringify({ garageId: testGarageId, packageId: 'pkg_monthly_standard', idempotencyKey: 'legacy_pending_guard' })
    }), workerEnv);

    expect(response.status).toBe(409);
    expect(mockDb.records.get(`recharge_request_guards/${testGarageId}`)).toBeUndefined();
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('recharge_requests/'))).toHaveLength(1);
  });

  it('applies the shared 30-request financial rate limit to recharge creation', async () => {
    const create = (index: number) => {
      const garageId = `rate-limit-garage-${index}`;
      mockDb.seed(`garages/${garageId}`, { name: garageId, createdByDelegateId: 'delegate-a' });
      return api.fetch(new Request('http://localhost/api/recharge-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-delegate-token-delegate-a' },
        body: JSON.stringify({ garageId, packageId: 'pkg_monthly_standard', idempotencyKey: `delegate_recharge_limiter_${index}` })
      }), workerEnv);
    };

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
    expect(mockDb.records.get(`recharge_request_guards/${testGarageId}`)?.activeRequestId).toBe(requestId);
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
    expect(mockDb.records.get(`recharge_request_guards/${testGarageId}`)).toMatchObject({ initialized: true, activeRequestId: null });
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

  it('records a manual-credit ledger entry when approving a balance-top-up request', async () => {
    const createRes = await api.fetch(new Request('http://localhost/api/recharge-requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer valid-garage-token-${testGarageId}`
      },
      body: JSON.stringify({
        garageId: testGarageId,
        packageId: 'balance_topup',
        requestType: 'balance_topup',
        amount: 75,
        idempotencyKey: 'ledger_approval_request_1'
      })
    }), workerEnv);
    const createBody = await createRes.json() as any;
    const approvalKey = 'ledger_approval_key_1';

    const processRes = await api.fetch(new Request('http://localhost/api/recharge-requests/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
        'x-idempotency-key': approvalKey
      },
      body: JSON.stringify({ requestId: createBody.id, idempotencyKey: approvalKey })
    }), workerEnv);

    expect(processRes.status).toBe(200);
    const ledgerEntries = [...mockDb.records.entries()].filter(([path]) => path.startsWith('manual_credit_ledger/'));
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]?.[1]).toMatchObject({
      operationId: createBody.id,
      garageId: testGarageId,
      amount: 75,
      source: 'approved_recharge_request',
      approvedBy: 'admin-uid'
    });
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
    const ledgerEntries = [...mockDb.records.values()].filter((record) => record.source === 'admin_direct_topup');
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0]).toMatchObject({
      garageId: testGarageId,
      amount: 200,
      previousBalance: 100,
      newBalance: 300,
      approvedBy: 'admin-uid'
    });
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

  it('requires a settlement idempotency key and rejects zero-balance no-op records', async () => {
    const missingKey = await api.fetch(new Request('http://localhost/api/delegates/settle-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ id: testDelegateId })
    }), workerEnv);
    expect(missingKey.status).toBe(400);
    expect(await missingKey.json()).toMatchObject({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('settlements/'))).toHaveLength(0);

    mockDb.seed(`delegates/${testDelegateId}`, { totalRechargedAmount: 0 });
    const zeroBalance = await api.fetch(new Request('http://localhost/api/delegates/settle-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
        'x-idempotency-key': 'zero_settlement_guard'
      },
      body: JSON.stringify({ id: testDelegateId, idempotencyKey: 'zero_settlement_guard' })
    }), workerEnv);
    expect(zeroBalance.status).toBe(409);
    expect(await zeroBalance.json()).toMatchObject({ success: false, error: 'NO_UNSETTLED_COMMISSION' });
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('settlements/'))).toHaveLength(0);
    expect([...mockDb.records.keys()].filter((path) => path.includes('/events/'))).toHaveLength(0);
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

  it('7. financial reports enforce admin authorization and preserve filters', async () => {
    const denied = await api.fetch(new Request('http://localhost/api/reports/financial', {
      headers: { 'Authorization': 'Bearer valid-garage-token-worker-test-garage-cf7' }
    }), workerEnv);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ success: false });

    const filtered = await api.fetch(new Request('http://localhost/api/reports/financial?start=2026-01-01&end=2026-12-31&delegateId=worker-test-delegate-cf7', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(filtered.status).toBe(200);
    expect((await filtered.json() as any).data.filters).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
      delegateId: 'worker-test-delegate-cf7'
    });
  });
  it('pushes the selected date range into Firestore reads and preserves matching totals', async () => {
    mockDb.seed('garages/financial-read-test/events/before', {
      eventType: 'recharge_approved', aggregateId: 'before',
      occurredAt: '2025-12-31T23:59:59.000Z', payload: { amount: 11 }
    });
    mockDb.seed('garages/financial-read-test/events/in-range', {
      eventType: 'recharge_approved', aggregateId: 'in-range',
      occurredAt: '2026-01-15T12:00:00.000Z', payload: { amount: 100 }
    });
    mockDb.seed('garages/financial-read-test/events/after', {
      eventType: 'recharge_approved', aggregateId: 'after',
      occurredAt: '2026-02-01T00:00:00.000Z', payload: { amount: 13 }
    });

    mockDb.resetDocumentCounts();
    const unbounded = await api.fetch(new Request('http://localhost/api/reports/financial', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(unbounded.status).toBe(200);
    const unboundedReads = mockDb.documentReadCount;

    mockDb.resetDocumentCounts();
    const bounded = await api.fetch(new Request('http://localhost/api/reports/financial?start=2026-01-01&end=2026-02-01', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(bounded.status).toBe(200);
    expect((await bounded.json() as any).data.report.grossRechargeTotal).toBe(100);
    expect(mockDb.documentReadCount).toBeLessThan(unboundedReads);
  });
  it('defaults an undated report to a bounded 12-month window', async () => {
    const response = await api.fetch(new Request('http://localhost/api/reports/financial', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.data.filters.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.data.filters.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(`${body.data.filters.end}T00:00:00.000Z`) - Date.parse(`${body.data.filters.start}T00:00:00.000Z`)) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(365);
    expect(days).toBeLessThanOrEqual(367);
  });
  it('aggregates across stable cursor pages with exact totals, settlement cutoffs, and delegate filtering', async () => {
    const events: any[] = [];
    const settlements: any[] = [];
    for (let index = 0; index < 250; index += 1) {
      const occurredAt = '2026-01-15T12:00:00.000Z';
      const event = { eventType: 'recharge_approved', aggregateId: `recharge-${index}`, occurredAt, payload: { amount: 1, delegateId: 'delegate-a' } };
      events.push(event);
      mockDb.seed(`garages/financial-pages/events/event-${String(index).padStart(3, '0')}`, event);
      const settledAt = new Date(`2026-01-16T12:${String(index % 60).padStart(2, '0')}:00.000Z`);
      const settlement = { settlementId: `settlement-${index}`, delegateId: 'delegate-a', settledAt, previousCycleTotal: 1 };
      settlements.push(settlement);
      mockDb.seed(`settlements/settlement-${String(index).padStart(3, '0')}`, settlement);
    }
    const finalEvent = { eventType: 'recharge_approved', aggregateId: 'recharge-final', occurredAt: '2026-01-18T12:00:00.000Z', payload: { amount: 12, delegateId: 'delegate-a' } };
    const finalSettlement = { settlementId: 'settlement-final', delegateId: 'delegate-a', settledAt: new Date('2026-01-17T12:00:00.000Z'), previousCycleTotal: 5 };
    events.push(finalEvent);
    settlements.push(finalSettlement);
    mockDb.seed('garages/financial-pages/events/event-final', finalEvent);
    mockDb.seed('settlements/settlement-final', finalSettlement);
    const otherDelegateEvent = { eventType: 'recharge_approved', aggregateId: 'other-delegate', occurredAt: '2026-01-18T13:00:00.000Z', payload: { amount: 999, delegateId: 'delegate-b' } };
    mockDb.seed('garages/financial-pages/events/other-delegate', otherDelegateEvent);
    const endBoundaryEvent = { eventType: 'recharge_approved', aggregateId: 'boundary', occurredAt: '2026-02-01T00:00:00.000Z', payload: { amount: 10000, delegateId: 'delegate-a' } };
    mockDb.seed('garages/financial-pages/events/end-boundary', endBoundaryEvent);

    mockDb.resetDocumentCounts();
    const response = await api.fetch(new Request('http://localhost/api/reports/financial?start=2026-01-01&end=2026-02-01&delegateId=delegate-a', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    const expected = calculateFinancialReport([...events, otherDelegateEvent, endBoundaryEvent], settlements, {
      start: '2026-01-01', end: '2026-02-01', delegateId: 'delegate-a'
    });
    expect(body.data.report).toEqual(expected);
    expect(body.data.report).toMatchObject({ grossRechargeTotal: 262, historicalSettledTotal: 255, currentUnsettledByDelegate: { 'delegate-a': 12 } });
    expect(mockDb.queryResultSizes).toContain(250);
    expect(Math.max(...mockDb.queryResultSizes)).toBeLessThanOrEqual(250);
  });

  it('8. financial reports reject an invalid date range before reading projections', async () => {
    const invalid = await api.fetch(new Request('http://localhost/api/financial-summary?start=2026-12-31&end=2026-01-01', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ success: false, error: 'START_MUST_PRECEDE_END' });
  });

  it('rejects malformed and impossible report dates instead of returning a plausible report', async () => {
    for (const range of [
      'start=not-a-date&end=2026-12-31',
      'start=2026-02-30&end=2026-12-31',
      'start=2026-01-01&end=2026-13-01'
    ]) {
      const response = await api.fetch(new Request(`http://localhost/api/reports/financial?${range}`, {
        headers: { Authorization: 'Bearer valid-admin-token' }
      }), workerEnv);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ success: false, code: 'INVALID_REPORT_DATE', statusCode: 400 });
    }
  });

  it('preserves intentional zero-valued system settings and rejects invalid patches atomically', async () => {
    const zeroSettings = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ defaultTrialDays: 0, warningDaysThreshold: 0, monthlySubscribersFlatFee: 0 })
    }), workerEnv);
    expect(zeroSettings.status).toBe(200);
    expect(mockDb.records.get('system_config/global')).toMatchObject({
      defaultTrialDays: 0,
      warningDaysThreshold: 0,
      monthlySubscribersFlatFee: 0
    });

    const negative = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ monthlySubscribersFlatFee: -1 })
    }), workerEnv);
    expect(negative.status).toBe(400);
    expect(await negative.json()).toMatchObject({ success: false, code: 'MONTHLYSUBSCRIBERSFLATFEE_TOO_LOW', statusCode: 400 });
    expect(mockDb.records.get('system_config/global')).toMatchObject({ monthlySubscribersFlatFee: 0 });

    const malformedPrices = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ subscriptionPrices: [] })
    }), workerEnv);
    expect(malformedPrices.status).toBe(400);
    expect(await malformedPrices.json()).toMatchObject({ success: false, code: 'INVALID_SUBSCRIPTION_PRICES', statusCode: 400 });
    expect(mockDb.records.get('system_config/global')).toMatchObject({ monthlySubscribersFlatFee: 0 });
  });
});
