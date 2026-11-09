import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));

import { api } from '../../server/api';
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
  });

  it('pages delegate garages only and rejects unknown sections without querying them', async () => {
    mockDb.seed('delegates/delegate-uid', { name: 'Paginated Delegate' });
    for (let index = 0; index < 5; index += 1) {
      mockDb.seed(`garages/created-${index}`, { createdByDelegateId: 'delegate-uid', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
      mockDb.seed(`garages/referred-${index}`, { referrerId: 'delegate-uid', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
    }
    mockDb.resetDocumentCounts();
    const collectionSpy = vi.spyOn(mockDb, 'collection');

    const response = await api.fetch(new Request('http://localhost/api/delegates/dashboard?limit=2', {
      headers: { Authorization: 'Bearer valid-delegate-token' }
    }), workerEnv);
    const first = await response.json() as any;
    expect(response.status).toBe(200);
    expect(first.garages).toHaveLength(4);
    expect(first).not.toHaveProperty('requests');
    expect(first.pagination.createdGarages.hasMore).toBe(true);
    expect(first.pagination.referredGarages.hasMore).toBe(true);
    expect(first.pagination).not.toHaveProperty('requests');
    expect(mockDb.queryResultSizes.slice(-2)).toEqual([3, 3]);

    const queryCount = mockDb.queryResultSizes.length;
    const unknownSection = await api.fetch(new Request('http://localhost/api/delegates/dashboard?section=requests&limit=2', {
      headers: { Authorization: 'Bearer valid-delegate-token' }
    }), workerEnv);
    expect(unknownSection.status).toBe(400);
    expect(await unknownSection.json()).toMatchObject({ success: false, error: 'INVALID_PAGE_SECTION' });
    expect(mockDb.queryResultSizes).toHaveLength(queryCount);
    expect(collectionSpy.mock.calls.some(([path]) => path === 'recharge_requests')).toBe(false);
    collectionSpy.mockRestore();
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

  it('rejects retired subscriber-pricing and legacy configuration patches atomically', async () => {
    const retiredSubscriberFee = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ monthlySubscribersFlatFee: 0 })
    }), workerEnv);
    expect(retiredSubscriberFee.status).toBe(400);
    expect(await retiredSubscriberFee.json()).toMatchObject({ success: false, code: 'RETIRED_CONFIG_FIELD', statusCode: 400 });

    const retiredTrialSetting = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ defaultTrialDays: 15 })
    }), workerEnv);
    expect(retiredTrialSetting.status).toBe(400);
    expect(await retiredTrialSetting.json()).toMatchObject({ success: false, code: 'RETIRED_CONFIG_FIELD', statusCode: 400 });

    const negative = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ monthlySubscribersFlatFee: -1 })
    }), workerEnv);
    expect(negative.status).toBe(400);
    expect(await negative.json()).toMatchObject({ success: false, code: 'RETIRED_CONFIG_FIELD', statusCode: 400 });

    const malformedPrices = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ subscriptionPrices: [] })
    }), workerEnv);
    expect(malformedPrices.status).toBe(400);
    expect(await malformedPrices.json()).toMatchObject({ success: false, code: 'RETIRED_CONFIG_FIELD', statusCode: 400 });
  });
});
