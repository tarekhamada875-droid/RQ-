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

describe('CF5 — Cloudflare Worker Vehicle Operational Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf5';

  beforeEach(async () => {
    mockDb.clear();
    mockDb.seed(`garages/${testGarageId}`, {
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
  });

  it('1. POST /api/vehicles/check-in validates inputs and checks in a vehicle', async () => {
    // Unauthenticated
    const unauthRes = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'أ ب ج 1234' })
    }));
    expect(unauthRes.status).toBe(401);

    // Missing plate (using admin token because operator is restricted)
    const missingPlateRes = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({ garageId: testGarageId })
    }), workerEnv);
    expect(missingPlateRes.status).toBe(400);

    // Valid check-in
    const validCheckInRes = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
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
    const replayRes = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
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

  it('resolves deterministic subscribers inside the transaction and bounds legacy fallback reads', async () => {
    const deterministicPlateRaw = 'ABC1234';
    const deterministicSubscriberId = `plate_${Buffer.from(deterministicPlateRaw).toString('base64url')}`;
    mockDb.seed(`garages/${testGarageId}/subscribers/${deterministicSubscriberId}`, {
      plateNumber: 'ABC 1234',
      plateNumberRaw: deterministicPlateRaw,
      startDate: '2020-01-01',
      endDate: '2099-12-31'
    });

    mockDb.resetDocumentCounts();
    const deterministicResponse = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'ABC 1234', plateRaw: deterministicPlateRaw })
    }), workerEnv);

    expect(deterministicResponse.status).toBe(409);
    expect(await deterministicResponse.json()).toMatchObject({ success: false });
    const deterministicReadCount = mockDb.documentReadCount;

    const legacyPlateRaw = 'XYZ9876';
    mockDb.seed(`garages/${testGarageId}/subscribers/legacy-sub`, {
      plateNumber: 'XYZ 9876',
      plateNumberRaw: legacyPlateRaw,
      startDate: '2020-01-01',
      endDate: '2099-12-31'
    });
    mockDb.resetDocumentCounts();
    const legacyResponse = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'XYZ 9876', plateRaw: legacyPlateRaw })
    }), workerEnv);

    expect(legacyResponse.status).toBe(409);
    expect(await legacyResponse.json()).toMatchObject({ success: false });
    expect(mockDb.documentReadCount).toBe(deterministicReadCount + 2);
  });

  it('2. POST /api/vehicles/check-out processes vehicle exit and calculates cost', async () => {
    // Check in vehicle first
    await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'س ص ع 5678',
        plateRaw: 'سصع5678',
        type: 'hourly'
      })
    }), workerEnv);

    // Check out
    const checkOutRes = await api.fetch(new Request('http://localhost/api/vehicles/check-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
        'x-idempotency-key': 'idemp_checkout_1'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        vehicleId: 'سصع5678',
        idempotencyKey: 'idemp_checkout_1'
      })
    }), workerEnv);

    expect(checkOutRes.status).toBe(200);
    const body = await checkOutRes.json() as any;
    expect(body.success).toBe(true);
    expect(typeof body.data.cost).toBe('number');

    const replayRes = await api.fetch(new Request('http://localhost/api/vehicles/check-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token',
        'x-idempotency-key': 'idemp_checkout_1'
      },
      body: JSON.stringify({ garageId: testGarageId, vehicleId: 'سصع5678', idempotencyKey: 'idemp_checkout_1' })
    }), workerEnv);
    expect(replayRes.status).toBe(200);
    expect(await replayRes.json()).toMatchObject({ success: true, data: { cost: body.data.cost } });
  });

  it('rejects cross-garage vehicle mutations before writing state', async () => {
    const before = [...mockDb.records.entries()];
    const response = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-garage-token-other-garage'
      },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'أ ب ج 9999', plateRaw: 'أبج9999' })
    }), workerEnv);

    expect(response.status).toBe(403);
    expect([...mockDb.records.entries()]).toEqual(before);
  });

  it('3. POST /api/vehicles/delete with refund handles accounting rollback and event ledger', async () => {
    // Check in and check out vehicle
    await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'ق ف غ 9876',
        plateRaw: 'قفغ9876',
        type: 'hourly'
      })
    }), workerEnv);

    await api.fetch(new Request('http://localhost/api/vehicles/check-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        vehicleId: 'قفغ9876'
      })
    }), workerEnv);

    // Delete with refund
    const deleteRes = await api.fetch(new Request('http://localhost/api/vehicles/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
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
    await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'ل م ن 4321',
        plateRaw: 'لمن4321',
        type: 'hourly'
      })
    }), workerEnv);

    // Query inside vehicles
    const insideRes = await api.fetch(new Request(`http://localhost/api/vehicles/inside?garageId=${testGarageId}`, {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(insideRes.status).toBe(200);
    const insideBody = await insideRes.json() as any;
    expect(insideBody.success).toBe(true);
    expect(Array.isArray(insideBody.vehicles)).toBe(true);
    expect(insideBody.vehicles.some((v: any) => v.id === 'لمن4321')).toBe(true);

    // Query activity history
    const historyRes = await api.fetch(new Request(`http://localhost/api/vehicles/history?garageId=${testGarageId}`, {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json() as any;
    expect(historyBody.success).toBe(true);
    expect(Array.isArray(historyBody.logs)).toBe(true);
  });
});
