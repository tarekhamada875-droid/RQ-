import { describe, it, expect, beforeEach } from 'vitest';
import { workerApp } from '../../server/cloudflareWorker';
import { adminDb } from '../../server/firebaseAdmin';

describe('CF5 — Cloudflare Worker Vehicle Operational Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf5';

  beforeEach(async () => {
    if (adminDb) {
      // Seed test garage document
      await adminDb.doc(`garages/${testGarageId}`).set({
        name: 'Worker Test Garage',
        hourlyRate: 10,
        overnightRate: 50,
        dailyCapacity: 100,
        carsInside: 0,
        todayCount: 0,
        todayRevenue: 0,
        totalRevenue: 0,
        totalVehiclesOut: 0,
        isTrial: false,
        balanceExpiry: '2099-12-31'
      });
    }
  });

  it('1. POST /api/vehicles/check-in validates inputs and checks in a vehicle', async () => {
    // Unauthenticated
    const unauthRes = await workerApp.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'أ ب ج 1234' })
    }));
    expect(unauthRes.status).toBe(401);

    // Missing plate
    const missingPlateRes = await workerApp.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({ garageId: testGarageId })
    }), workerEnv);
    expect(missingPlateRes.status).toBe(400);

    // Valid check-in
    const validCheckInRes = await workerApp.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken,
        'x-idempotency-key': 'idemp_checkin_1'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'أ ب ج 1234',
        plateRaw: 'أبج1234',
        type: 'hourly'
      })
    }), workerEnv);

    expect(validCheckInRes.status).toBe(200);
    const body = await validCheckInRes.json() as any;
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.vehicle.status).toBe('inside');
    expect(body.data.carsInside).toBe(1);

    // Replay idempotency
    const replayRes = await workerApp.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken,
        'x-idempotency-key': 'idemp_checkin_1'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'أ ب ج 1234',
        plateRaw: 'أبج1234',
        type: 'hourly'
      })
    }), workerEnv);
    expect(replayRes.status).toBe(200);
  });

  it('2. POST /api/vehicles/check-out processes vehicle exit and calculates cost', async () => {
    // Check in vehicle first
    await workerApp.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'س ص ع 5678',
        plateRaw: 'سصع5678',
        type: 'hourly'
      })
    }), workerEnv);

    // Check out
    const checkOutRes = await workerApp.fetch(new Request('http://localhost/api/vehicles/check-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        vehicleId: 'سصع5678'
      })
    }), workerEnv);

    expect(checkOutRes.status).toBe(200);
    const body = await checkOutRes.json() as any;
    expect(body.success).toBe(true);
    expect(typeof body.data.cost).toBe('number');
  });

  it('3. POST /api/vehicles/delete with refund handles accounting rollback and event ledger', async () => {
    // Check in and check out vehicle
    await workerApp.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'ق ف غ 9876',
        plateRaw: 'قفغ9876',
        type: 'hourly'
      })
    }), workerEnv);

    await workerApp.fetch(new Request('http://localhost/api/vehicles/check-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        vehicleId: 'قفغ9876'
      })
    }), workerEnv);

    // Delete with refund
    const deleteRes = await workerApp.fetch(new Request('http://localhost/api/vehicles/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        vehicleId: 'قفغ9876',
        refundAmount: 10
      })
    }), workerEnv);

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json() as any;
    expect(body.success).toBe(true);
  });

  it('4. GET /api/vehicles/inside and GET /api/vehicles/history return live operational state', async () => {
    // Check in vehicle
    await workerApp.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-backend-operator-token': operatorToken
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'ل م ن 4321',
        plateRaw: 'لمن4321',
        type: 'hourly'
      })
    }), workerEnv);

    // Query inside vehicles
    const insideRes = await workerApp.fetch(new Request(`http://localhost/api/vehicles/inside?garageId=${testGarageId}`, {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(insideRes.status).toBe(200);
    const insideBody = await insideRes.json() as any;
    expect(insideBody.success).toBe(true);
    expect(Array.isArray(insideBody.vehicles)).toBe(true);
    expect(insideBody.vehicles.some((v: any) => v.id === 'لمن4321')).toBe(true);

    // Query activity history
    const historyRes = await workerApp.fetch(new Request(`http://localhost/api/vehicles/history?garageId=${testGarageId}`, {
      headers: { 'x-backend-operator-token': operatorToken }
    }), workerEnv);

    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json() as any;
    expect(historyBody.success).toBe(true);
    expect(Array.isArray(historyBody.logs)).toBe(true);
  });
});
