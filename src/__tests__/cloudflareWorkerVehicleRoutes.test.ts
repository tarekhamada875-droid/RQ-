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

    const writesBeforeInvalidType = mockDb.documentWriteCount;
    const invalidTypeRes = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId,
        plateNumber: 'ABC 9999',
        plateRaw: 'ABC9999',
        type: 'motorcycle'
      })
    }), workerEnv);
    expect(invalidTypeRes.status).toBe(400);
    expect(await invalidTypeRes.json()).toMatchObject({ success: false, error: 'INVALID_VEHICLE_TYPE' });
    expect(mockDb.documentWriteCount).toBe(writesBeforeInvalidType);

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

  it('debits one prepaid credit atomically and returns the auditable remaining balance', async () => {
    mockDb.seed(`garages/${testGarageId}`, {
      billingModel: 'prepaid_credits',
      credits: 3,
    });
    const response = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token', 'x-idempotency-key': 'prepaid-entry-1' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'ABC 1111', plateRaw: 'ABC1111' }),
    }), workerEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { credits: 2, remainingCredits: 2, creditDebit: { amount: 1 } } });
    expect(mockDb.records.get(`garages/${testGarageId}`)?.credits).toBe(2);
    expect([...mockDb.records.values()].some((record: any) => record.kind === 'regular_entry_debit' && record.amount === 1)).toBe(true);
  });

  it('blocks a prepaid regular entry at zero credits without writing vehicle state', async () => {
    mockDb.seed(`garages/${testGarageId}`, { billingModel: 'prepaid_credits', credits: 0 });
    const response = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'ABC 2222', plateRaw: 'ABC2222' }),
    }), workerEnv);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, error: 'رصيد غير كافٍ لإتمام هذه العملية' });
    expect(mockDb.records.has(`garages/${testGarageId}/vehicles/ABC2222`)).toBe(false);
  });

  it('does not debit prepaid credits for a monthly subscriber check-in attempt', async () => {
    mockDb.seed(`garages/${testGarageId}`, { billingModel: 'prepaid_credits', credits: 7 });
    const subscriberId = `plate_${Buffer.from('ABC1234').toString('base64url')}`;
    mockDb.seed(`garages/${testGarageId}/subscribers/${subscriberId}`, { plateNumberRaw: 'ABC1234', startDate: '2020-01-01', endDate: '2099-12-31' });
    const response = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'ABC 1234', plateRaw: 'ABC1234' }),
    }), workerEnv);
    expect(response.status).toBe(409);
    expect(mockDb.records.get(`garages/${testGarageId}`)?.credits).toBe(7);
  });

  it('restores the consumed credit on an authorized vehicle deletion', async () => {
    mockDb.seed(`garages/${testGarageId}`, { billingModel: 'prepaid_credits', credits: 1 });
    const checkIn = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token', 'x-idempotency-key': 'prepaid-entry-restore-1' },
      body: JSON.stringify({ garageId: testGarageId, plateNumber: 'ABC 3333', plateRaw: 'ABC3333' }),
    }), workerEnv);
    expect(checkIn.status).toBe(200);
    const deletion = await api.fetch(new Request('http://localhost/api/vehicles/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token', 'x-idempotency-key': 'prepaid-delete-restore-1' },
      body: JSON.stringify({ garageId: testGarageId, vehicleId: 'ABC3333', refundAmount: 0 }),
    }), workerEnv);
    expect(deletion.status).toBe(200);
    expect(mockDb.records.get(`garages/${testGarageId}`)?.credits).toBe(1);
    expect([...mockDb.records.values()].some((record: any) => record.kind === 'authorized_deletion_restore' && record.amount === 1)).toBe(true);
  });

  it('allows the same garage or staff entity to correct its entry after re-login with a new Firebase UID', async () => {
    const cases = [
      {
        role: 'garage',
        initialToken: `Bearer valid-garage-token-${testGarageId}`,
        reloginToken: `Bearer valid-garage-relogin-token-${testGarageId}`,
        plateNumber: 'GRG 4444',
        plateRaw: 'GRG4444',
        entrantEntityId: testGarageId,
        originalUid: `garage-uid-${testGarageId}`
      },
      {
        role: 'staff',
        initialToken: `Bearer valid-staff-token-${testGarageId}`,
        reloginToken: `Bearer valid-staff-relogin-token-${testGarageId}`,
        plateNumber: 'STF 5555',
        plateRaw: 'STF5555',
        entrantEntityId: `staff-uid-${testGarageId}`,
        originalUid: `staff-uid-${testGarageId}`
      }
    ];

    for (const entry of cases) {
      const checkIn = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: entry.initialToken },
        body: JSON.stringify({ garageId: testGarageId, plateNumber: entry.plateNumber, plateRaw: entry.plateRaw })
      }), workerEnv);
      expect(checkIn.status).toBe(200);

      const storedVehicle = mockDb.records.get(`garages/${testGarageId}/vehicles/${entry.plateRaw}`);
      expect(storedVehicle).toMatchObject({
        enteredByUid: entry.originalUid,
        enteredByEntityId: entry.entrantEntityId,
        enteredByRole: entry.role,
        staffId: entry.entrantEntityId
      });

      const correction = await api.fetch(new Request('http://localhost/api/vehicles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: entry.reloginToken, 'x-idempotency-key': `relogin-correction-${entry.role}` },
        body: JSON.stringify({ garageId: testGarageId, vehicleId: entry.plateRaw, refundAmount: 0 })
      }), workerEnv);
      expect(correction.status).toBe(200);
    }
  });

  it('denies peer and unidentified legacy corrections to garage/staff while preserving Admin correction access', async () => {
    const legacyPath = `garages/${testGarageId}/vehicles/LEGACY123`;
    mockDb.seed(legacyPath, {
      plateNumber: 'LEGACY 123',
      plateNumberRaw: 'LEGACY123',
      status: 'outside',
      enteredByUid: `staff-uid-${testGarageId}`,
      staffId: `staff-uid-${testGarageId}`
    });
    const legacyDenied = await api.fetch(new Request('http://localhost/api/vehicles/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-staff-token-${testGarageId}`, 'x-idempotency-key': 'legacy-staff-correction' },
      body: JSON.stringify({ garageId: testGarageId, vehicleId: 'LEGACY123', refundAmount: 0 })
    }), workerEnv);
    expect(legacyDenied.status).toBe(403);
    expect(mockDb.records.get(legacyPath)?.status).toBe('outside');

    const peerPath = `garages/${testGarageId}/vehicles/PEER1234`;
    mockDb.seed(peerPath, {
      plateNumber: 'PEER 1234',
      plateNumberRaw: 'PEER1234',
      status: 'outside',
      enteredByUid: `staff-uid-${testGarageId}`,
      enteredByEntityId: `staff-uid-${testGarageId}`,
      enteredByRole: 'staff'
    });
    const peerDenied = await api.fetch(new Request('http://localhost/api/vehicles/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer valid-staff-peer-token-${testGarageId}`, 'x-idempotency-key': 'peer-staff-correction' },
      body: JSON.stringify({ garageId: testGarageId, vehicleId: 'PEER1234', refundAmount: 0 })
    }), workerEnv);
    expect(peerDenied.status).toBe(403);
    expect(mockDb.records.get(peerPath)?.status).toBe('outside');

    const adminCorrection = await api.fetch(new Request('http://localhost/api/vehicles/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token', 'x-idempotency-key': 'admin-legacy-correction' },
      body: JSON.stringify({ garageId: testGarageId, vehicleId: 'LEGACY123', refundAmount: 0 })
    }), workerEnv);
    expect(adminCorrection.status).toBe(200);
  });

  it('shares the three-event Cairo-day correction allowance across staff operations', async () => {
    const staffToken = `Bearer valid-staff-token-${testGarageId}`;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    mockDb.seed(`garages/${testGarageId}`, { dailyDeletionCount: 0, lastDeletionDate: today });
    for (let index = 1; index <= 4; index += 1) {
      mockDb.seed(`garages/${testGarageId}/vehicles/staff-error-${index}`, {
        plateNumber: `staff-error-${index}`,
        plateNumberRaw: `staff-error-${index}`,
        status: 'outside',
        enteredByUid: `staff-uid-${testGarageId}`,
        enteredByEntityId: `staff-uid-${testGarageId}`,
        enteredByRole: 'staff',
      });
      const response = await api.fetch(new Request('http://localhost/api/vehicles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: staffToken, 'x-idempotency-key': `staff-correction-${index}` },
        body: JSON.stringify({ garageId: testGarageId, vehicleId: `staff-error-${index}`, refundAmount: 0 }),
      }), workerEnv);
      expect(response.status).toBe(index <= 3 ? 200 : 409);
    }
    expect(mockDb.records.get(`garages/${testGarageId}`)?.dailyDeletionCount).toBe(3);
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
    expect(body.data.carsInside).toBe(0);
    expect(typeof body.data.totalVehiclesOut).toBe('number');
    expect(typeof body.data.todayRevenue).toBe('number');
    expect(typeof body.data.totalRevenue).toBe('number');
    expect(typeof body.data.todayCount).toBe('number');
    expect(typeof body.data.lastTransactionDate).toBe('string');

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
    expect(await replayRes.json()).toEqual({ success: true, data: body.data });
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

  it('filters vehicle history by Cairo date before applying the result limit', async () => {
    for (let index = 0; index < 55; index += 1) {
      mockDb.seed(`activity_logs/previous-day-${index}`, {
        garageId: testGarageId,
        actionType: 'check_out',
        timestamp: new Date(`2026-10-23T12:${String(index % 60).padStart(2, '0')}:00.000Z`)
      });
    }
    mockDb.seed('activity_logs/current-day-oldest', {
      garageId: testGarageId,
      actionType: 'check_in',
      timestamp: new Date('2026-10-24T06:00:00.000Z')
    });
    mockDb.seed('activity_logs/current-day-newest', {
      garageId: testGarageId,
      actionType: 'check_out',
      timestamp: new Date('2026-10-24T18:00:00.000Z')
    });

    const response = await api.fetch(new Request(
      `http://localhost/api/vehicles/history?garageId=${testGarageId}&date=2026-10-24&limit=2`,
      { headers: { Authorization: 'Bearer valid-admin-token' } }
    ), workerEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      count: 2,
      logs: [
        { id: 'current-day-newest' },
        { id: 'current-day-oldest' }
      ]
    });

    const invalidDateResponse = await api.fetch(new Request(
      `http://localhost/api/vehicles/history?garageId=${testGarageId}&date=2026-02-31`,
      { headers: { Authorization: 'Bearer valid-admin-token' } }
    ), workerEnv);
    expect(invalidDateResponse.status).toBe(400);
    expect(await invalidDateResponse.json()).toMatchObject({ success: false, error: 'INVALID_DATE' });
  });

});
