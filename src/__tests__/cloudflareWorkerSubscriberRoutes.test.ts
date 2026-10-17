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
installDefaultWorkerTestSessionHeaders(api, mockDb);

describe('CF6 — Cloudflare Worker Subscriber Lifecycle Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf6';

  beforeEach(async () => {
    mockDb.clear();
    mockDb.seed(`garages/${testGarageId}`, {
      name: 'Subscriber Test Garage',
      dailyCapacity: 50,
      carsInside: 0,
      isTrial: false,
      balanceExpiry: '2099-12-31'
    });
  });

  it('1. POST /api/subscribers/add validates, prevents duplicates, and creates subscriber', async () => {
    // Unauthenticated
    const unauthRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId: testGarageId, subscriberData: {} })
    }));
    expect(unauthRes.status).toBe(401);

    // Missing garage ID (using admin token because operator is restricted)
    const missingGarageRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({ subscriberData: { plateNumber: 'أ ب ج 1111' } })
    }), workerEnv);
    expect(missingGarageRes.status).toBe(400);

    const testIdempKey = `idemp_sub_add_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Valid add
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
        'x-idempotency-key': testIdempKey
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberData: {
          name: 'Ahmed Subscriber',
          phone: '01012345678',
          plateNumber: 'أ ب ج 1111',
          plateNumberRaw: 'أبج1111',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          packagePrice: 500
        }
      })
    }), workerEnv);

    expect(addRes.status).toBe(200);
    const body = await addRes.json() as any;
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();

    // Duplicate plate should return 409 without falling through to legacy queries.
    mockDb.resetDocumentCounts();
    const duplicateRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberData: {
          name: 'Duplicate Subscriber',
          phone: '01055556666',
          plateNumber: 'أ ب ج 1111',
          plateNumberRaw: 'أبج1111',
          startDate: '2026-11-01',
          endDate: '2026-11-30'
        }
      })
    }), workerEnv);

    const duplicateBody = await duplicateRes.json() as any;
    expect(duplicateRes.status).toBe(409);
    expect(duplicateBody.success).toBe(false);
    expect(mockDb.documentReadCount).toBe(5); // Canonical-index miss, Worker auth reads, plus one deterministic subscriber document
  });

  it('replays an identical add idempotently and rejects key reuse with a changed payload', async () => {
    const idempotencyKey = 'subscriber-route-replay-key';
    const subscriberData = {
      name: 'Idempotent Subscriber',
      plateNumber: 'أ ب ج 7777',
      plateNumberRaw: 'أبج7777',
      startDate: '2026-10-01',
      endDate: '2026-10-31'
    };
    const add = (data: typeof subscriberData) => api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token',
        'x-idempotency-key': idempotencyKey
      },
      body: JSON.stringify({ garageId: testGarageId, subscriberData: data })
    }), workerEnv);

    const first = await add(subscriberData);
    const replay = await add(subscriberData);
    const firstBody = await first.json();
    const replayBody = await replay.json();

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replayBody).toEqual(firstBody);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith(`garages/${testGarageId}/events/`))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('idempotency_records/'))).toHaveLength(1);

    const changed = await add({ ...subscriberData, name: 'Changed Subscriber' });
    expect(changed.status).toBe(409);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith(`garages/${testGarageId}/events/`))).toHaveLength(1);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('idempotency_records/'))).toHaveLength(1);
  });

  it('2. POST /api/subscribers/renew extends subscription date range', async () => {
    // Add subscriber first
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberData: {
          name: 'Mohamed Renew',
          phone: '01087654321',
          plateNumber: 'س ص ع 2222',
          plateNumberRaw: 'سصع2222',
          startDate: '2026-10-01',
          endDate: '2026-10-31'
        }
      })
    }), workerEnv);

    const addBody = await addRes.json() as any;
    const subscriberId = addBody.id;

    // Renew
    const renewRes = await api.fetch(new Request('http://localhost/api/subscribers/renew', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberId,
        newDates: {
          startDate: '2026-11-01',
          endDate: '2026-11-30'
        }
      })
    }), workerEnv);

    expect(renewRes.status).toBe(200);
    const renewBody = await renewRes.json() as any;
    expect(renewBody.success).toBe(true);
  });

  it('debits exactly five paid credits and returns the remaining balance for prepaid renewal', async () => {
    mockDb.seed(`garages/${testGarageId}`, {
      billingModel: 'prepaid_credits',
      creditBalance: { paid: 12, referral: 20 },
    });
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, subscriberData: {
        name: 'Paid Renewal', plateNumber: 'س ص ع 4444', plateNumberRaw: 'سصع4444',
        startDate: '2026-10-01', endDate: '2026-10-31'
      } })
    }), workerEnv);
    const subscriberId = (await addRes.json() as any).id;
    const renewRes = await api.fetch(new Request('http://localhost/api/subscribers/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token', 'x-idempotency-key': 'renew-paid-five-credits' },
      body: JSON.stringify({ garageId: testGarageId, subscriberId, newDates: { startDate: '2026-11-01', endDate: '2026-11-30' } })
    }), workerEnv);
    expect(renewRes.status).toBe(200);
    expect(await renewRes.json()).toMatchObject({ success: true, creditBalance: { paid: 7, referral: 20, trial: 0 }, creditDebit: { amount: 5, bucket: 'paid' } });
    expect(mockDb.records.get(`garages/${testGarageId}`)?.creditBalance).toEqual({ paid: 7, referral: 20, trial: 0 });
    expect([...mockDb.records.values()].some((record: any) => record.kind === 'subscriber_renewal_debit' && record.amount === 5 && record.bucket === 'paid')).toBe(true);
  });

  it('blocks prepaid renewal below five paid credits and never spends referral credits', async () => {
    mockDb.seed(`garages/${testGarageId}`, { billingModel: 'prepaid_credits', creditBalance: { paid: 4, referral: 20 } });
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, subscriberData: { name: 'Underfunded Renewal', plateNumber: 'س ص ع 5555', plateNumberRaw: 'سصع5555', startDate: '2026-10-01', endDate: '2026-10-31' } })
    }), workerEnv);
    const subscriberId = (await addRes.json() as any).id;
    const renewRes = await api.fetch(new Request('http://localhost/api/subscribers/renew', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, subscriberId, newDates: { startDate: '2026-11-01', endDate: '2026-11-30' } })
    }), workerEnv);
    expect(renewRes.status).toBe(409);
    expect(await renewRes.json()).toMatchObject({ success: false, error: 'رصيد التجديد المدفوع غير كافٍ لإتمام تجديد المشترك' });
    expect(mockDb.records.get(`garages/${testGarageId}`)?.creditBalance).toEqual({ paid: 4, referral: 20 });
    expect([...mockDb.records.values()].some((record: any) => record.kind === 'subscriber_renewal_debit')).toBe(false);
  });

  it('replays a prepaid renewal idempotently without a second debit or event', async () => {
    mockDb.seed(`garages/${testGarageId}`, { billingModel: 'prepaid_credits', creditBalance: { paid: 10, referral: 0 } });
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, subscriberData: { name: 'Replay Renewal', plateNumber: 'س ص ع 6666', plateNumberRaw: 'سصع6666', startDate: '2026-10-01', endDate: '2026-10-31' } })
    }), workerEnv);
    const subscriberId = (await addRes.json() as any).id;
    const request = () => api.fetch(new Request('http://localhost/api/subscribers/renew', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token', 'x-idempotency-key': 'renew-replay-five-credits' },
      body: JSON.stringify({ garageId: testGarageId, subscriberId, newDates: { startDate: '2026-11-01', endDate: '2026-11-30' } })
    }), workerEnv);
    const first = await request();
    const firstBody = await first.json();
    const writesAfterFirst = mockDb.documentWriteCount;
    const replay = await request();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);
    expect(mockDb.documentWriteCount).toBe(writesAfterFirst);
    expect([...mockDb.records.values()].filter((record: any) => record.kind === 'subscriber_renewal_debit')).toHaveLength(1);
    expect([...mockDb.records.values()].filter((record: any) => record.eventType === 'subscriber_renewed')).toHaveLength(1);
  });

  it('3. POST /api/subscribers/update updates subscriber metadata', async () => {
    // Add subscriber
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberData: {
          name: 'Tarek Update',
          phone: '01011112222',
          plateNumber: 'ق ف غ 3333',
          plateNumberRaw: 'قفغ3333',
          startDate: '2026-10-01',
          endDate: '2026-10-31'
        }
      })
    }), workerEnv);

    const addBody = await addRes.json() as any;
    const subscriberId = addBody.id;

    // Update
    const updateRes = await api.fetch(new Request('http://localhost/api/subscribers/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberId,
        updates: {
          name: 'Tarek Updated Name',
          phone: '01099998888',
          startDate: '2026-10-01',
          endDate: '2026-10-31'
        }
      })
    }), workerEnv);

    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json() as any;
    expect(updateBody.success).toBe(true);
  });

  it('4. POST /api/subscribers/delete removes subscriber record', async () => {
    // Add subscriber
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberData: {
          name: 'Delete Me',
          phone: '01000000000',
          plateNumber: 'ل م ن 4444',
          plateNumberRaw: 'لمن4444',
          startDate: '2026-10-01',
          endDate: '2026-10-31'
        }
      })
    }), workerEnv);

    const addBody = await addRes.json() as any;
    const subscriberId = addBody.id;

    // Delete
    const deleteRes = await api.fetch(new Request('http://localhost/api/subscribers/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberId
      })
    }), workerEnv);

    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json() as any;
    expect(deleteBody.success).toBe(true);
  });

  it('decrements maintained garagesCount only when deleting the last subscriber in a garage', async () => {
    const addSubscriber = async (plate: string) => {
      const response = await api.fetch(new Request('http://localhost/api/subscribers/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-admin-token'
        },
        body: JSON.stringify({
          garageId: testGarageId,
          subscriberData: {
            name: 'Summary Count Subscriber',
            plateNumber: plate,
            plateNumberRaw: plate,
            startDate: '2026-10-01',
            endDate: '2026-10-31'
          }
        })
      }), workerEnv);
      expect(response.status).toBe(200);
      return (await response.json() as any).id as string;
    };
    const deleteSubscriber = async (subscriberId: string) => api.fetch(new Request('http://localhost/api/subscribers/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-admin-token'
      },
      body: JSON.stringify({ garageId: testGarageId, subscriberId })
    }), workerEnv);
    const getSummary = async () => {
      const response = await api.fetch(new Request('http://localhost/api/admin/monthly-subscribers-summary', {
        headers: { Authorization: 'Bearer valid-admin-token' }
      }), workerEnv);
      expect(response.status).toBe(200);
      return (await response.json() as any).data.garagesCount as number;
    };

    const firstId = await addSubscriber('AB12345');
    expect(await getSummary()).toBe(1);
    const secondId = await addSubscriber('CD67890');
    expect(await getSummary()).toBe(1);

    expect((await deleteSubscriber(firstId)).status).toBe(200);
    expect(await getSummary()).toBe(1);
    expect((await deleteSubscriber(secondId)).status).toBe(200);
    expect(await getSummary()).toBe(0);
  });

  it('rejects cross-garage lifecycle mutations and immutable plate changes without writes', async () => {
    const addRes = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        subscriberData: {
          name: 'Scoped Subscriber',
          plateNumber: 'أ ب ج 5555',
          plateNumberRaw: 'أبج5555',
          startDate: '2026-10-01',
          endDate: '2026-10-31'
        }
      })
    }), workerEnv);
    const subscriberId = (await addRes.json() as any).id;
    const before = [...mockDb.records.entries()];

    const crossGarage = await api.fetch(new Request('http://localhost/api/subscribers/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-garage-token-other-garage'
      },
      body: JSON.stringify({ garageId: testGarageId, subscriberId, updates: { name: 'Must Not Change' } })
    }), workerEnv);
    expect(crossGarage.status).toBe(403);

    const immutablePlate = await api.fetch(new Request('http://localhost/api/subscribers/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({ garageId: testGarageId, subscriberId, updates: { plateNumberRaw: 'XYZ9999' } })
    }), workerEnv);
    expect(immutablePlate.status).toBe(409);
    expect([...mockDb.records.entries()]).toEqual(before);
  });
});
