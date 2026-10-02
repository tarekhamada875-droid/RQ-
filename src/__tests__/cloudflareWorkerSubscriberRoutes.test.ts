import { describe, it, expect, beforeEach } from 'vitest';
import { workerApp } from '../../server/cloudflareWorker';
import { adminDb } from '../../server/firebaseAdmin';

describe('CF6 — Cloudflare Worker Subscriber Lifecycle Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf6';

  beforeEach(async () => {
    if (adminDb) {
      await adminDb.doc(`garages/${testGarageId}`).set({
        name: 'Subscriber Test Garage',
        dailyCapacity: 50,
        carsInside: 0,
        isTrial: false,
        balanceExpiry: '2099-12-31'
      });

      const subSnaps = await adminDb.collection(`garages/${testGarageId}/subscribers`).get();
      const batch = adminDb.batch();
      subSnaps.docs.forEach((doc: any) => batch.delete(doc.ref));
      await batch.commit();
    }
  });

  it('1. POST /api/subscribers/add validates, prevents duplicates, and creates subscriber', async () => {
    // Unauthenticated
    const unauthRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId: testGarageId, subscriberData: {} })
    }));
    expect(unauthRes.status).toBe(401);

    // Missing garage ID
    const missingGarageRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({ subscriberData: { plateNumber: 'أ ب ج 1111' } })
    }), workerEnv);
    expect(missingGarageRes.status).toBe(400);

    const testIdempKey = `idemp_sub_add_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Valid add
    const addRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken,
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

    // Duplicate plate should return 409
    const duplicateRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
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
  });

  it('2. POST /api/subscribers/renew extends subscription date range', async () => {
    // Add subscriber first
    const addRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
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
    const renewRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/renew', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
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

  it('3. POST /api/subscribers/update updates subscriber metadata', async () => {
    // Add subscriber
    const addRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
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
    const updateRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
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
    const addRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
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
    const deleteRes = await workerApp.fetch(new Request('http://localhost/api/subscribers/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
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
});
