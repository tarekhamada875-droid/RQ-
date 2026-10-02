import { describe, it, expect, beforeEach } from 'vitest';
import { workerApp } from '../../server/cloudflareWorker';
import { adminDb } from '../../server/firebaseAdmin';

describe('CF8 — Cloudflare Worker Garage Management & Final Hardening Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf8';

  beforeEach(async () => {
    if (adminDb) {
      await adminDb.doc(`garages/${testGarageId}`).set({
        name: 'Existing Hardening Garage',
        hourlyRate: 10,
        overnightRate: 50,
        status: 'approved',
        dailyCapacity: 40
      });
    }
  });

  it('1. POST /api/garages/create creates new garage record and pin', async () => {
    // Unauthenticated
    const unauthRes = await workerApp.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Test Garage', pin: '9876' })
    }));
    expect(unauthRes.status).toBe(401);

    const testPin = String(Math.floor(10000000 + Math.random() * 90000000));
    const createRes = await workerApp.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        name: 'New Test Garage',
        phone: '01099990000',
        pin: testPin,
        isTrial: true,
        trialDays: 3
      })
    }), workerEnv);

    expect(createRes.status).toBe(200);
    const body = await createRes.json() as any;
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
  });

  it('2. POST /api/garages/update updates garage configuration fields', async () => {
    const updateRes = await workerApp.fetch(new Request('http://localhost/api/garages/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        id: testGarageId,
        hourlyRate: 15,
        overnightRate: 60,
        ownerName: 'Hardened Owner'
      })
    }), workerEnv);

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json() as any;
    expect(body.success).toBe(true);
  });

  it('3. POST /api/garages/delete initiates garage deletion job', async () => {
    const deleteRes = await workerApp.fetch(new Request('http://localhost/api/garages/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId
      })
    }), workerEnv);

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json() as any;
    expect(body.success).toBe(true);
    expect(body.deletionStarted).toBe(true);
  });

  it('4. GET /api/garages and GET /api/garages/:id return live garage data', async () => {
    const listRes = await workerApp.fetch(new Request('http://localhost/api/garages', {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.garages)).toBe(true);

    const getRes = await workerApp.fetch(new Request(`http://localhost/api/garages/${testGarageId}`, {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as any;
    expect(getBody.success).toBe(true);
    expect(getBody.garage.id).toBe(testGarageId);
  });
});
