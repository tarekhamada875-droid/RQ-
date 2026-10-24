import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from '../src/__tests__/mockFirestore';

const mockDb = new MockFirestore();

vi.mock('./firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { api } from './api';

installDefaultWorkerTestSessionHeaders(api, mockDb);

const garageId = 'vehicle-delete-refund-idempotency-test';
const idempotencyKey = 'vehicle-operation-retry-key-20261014';
const cairoDateKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(new Date());

type VehicleRequest = {
  path: '/api/vehicles/delete' | '/api/vehicles/refund';
  vehicleId: string;
  refundAmount: number | string;
};

function seedVehicleFixture(vehicleIds: string[] = ['vehicle-1', 'vehicle-2']) {
  const today = cairoDateKey();
  mockDb.seed(`garages/${garageId}`, {
    name: 'Synthetic F1 Garage',
    todayRevenue: 100,
    totalRevenue: 100,
    carsInside: 0
  });
  mockDb.seed(`garages/${garageId}/daily_stats/${today}`, {
    count: 0,
    exitsCount: 1,
    revenue: 100
  });
  for (const vehicleId of vehicleIds) {
    mockDb.seed(`garages/${garageId}/vehicles/${vehicleId}`, {
      plateNumber: vehicleId,
      plateNumberRaw: vehicleId,
      status: 'outside',
      totalCost: 50,
      exitTime: new Date('2026-10-14T10:00:00.000Z'),
      operationVersion: 0
    });
  }
}

async function callVehicleOperation(request: VehicleRequest, key = idempotencyKey) {
  return api.fetch(new Request(`http://localhost${request.path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-admin-token'
    },
    body: JSON.stringify({
      garageId,
      vehicleId: request.vehicleId,
      refundAmount: request.refundAmount,
      idempotencyKey: key
    })
  }));
}

function recordSnapshot() {
  return [...mockDb.records.entries()]
    .map(([path, value]) => [path, structuredClone(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

function eventRecords() {
  return [...mockDb.records.values()].filter((record) => record?.eventType === 'vehicle_refunded' || record?.eventType === 'vehicle_deleted');
}

function activityRecords() {
  return [...mockDb.records.values()].filter((record) => record?.actionType === 'delete_refund');
}

beforeEach(() => mockDb.clear());

describe('vehicle delete/refund idempotency (Worker route transactions)', () => {
  it('replays the same refund through either route alias without a second event or accounting change', async () => {
    seedVehicleFixture(['vehicle-1']);
    const refund = { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 12 } as const;

    const firstResponse = await callVehicleOperation(refund);
    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toMatchObject({ success: true });
    const afterFirst = recordSnapshot();
    const writesAfterFirst = mockDb.documentWriteCount;

    const retryResponse = await callVehicleOperation({ ...refund, path: '/api/vehicles/refund', refundAmount: '12.00' });
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toMatchObject({ success: true });

    expect(mockDb.documentWriteCount).toBe(writesAfterFirst);
    expect(recordSnapshot()).toEqual(afterFirst);
    expect(eventRecords()).toHaveLength(1);
    expect(eventRecords()[0]).toMatchObject({
      eventType: 'vehicle_refunded',
      payload: { refundAmount: 12 }
    });
    expect(activityRecords()).toHaveLength(1);
    expect(mockDb.records.get(`garages/${garageId}`).todayRevenue).toBe(88);
    expect(mockDb.records.get(`garages/${garageId}`).totalRevenue).toBe(88);
    expect(mockDb.records.get(`garages/${garageId}/daily_stats/${cairoDateKey()}`).revenue).toBe(88);
    expect([...mockDb.records.keys()].filter((path) => path.startsWith('idempotency_records/'))).toHaveLength(1);
  });

  it('rejects delete/refund, vehicle, and amount reuse in both request orders without further writes', async () => {
    const scenarios: Array<{ name: string; first: VehicleRequest; second: VehicleRequest }> = [
      {
        name: 'delete then refund',
        first: { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 0 },
        second: { path: '/api/vehicles/refund', vehicleId: 'vehicle-1', refundAmount: 12 }
      },
      {
        name: 'refund then delete',
        first: { path: '/api/vehicles/refund', vehicleId: 'vehicle-1', refundAmount: 12 },
        second: { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 0 }
      },
      {
        name: 'vehicle one then vehicle two',
        first: { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 0 },
        second: { path: '/api/vehicles/delete', vehicleId: 'vehicle-2', refundAmount: 0 }
      },
      {
        name: 'vehicle two then vehicle one',
        first: { path: '/api/vehicles/delete', vehicleId: 'vehicle-2', refundAmount: 0 },
        second: { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 0 }
      },
      {
        name: 'refund amount 12 then 20',
        first: { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 12 },
        second: { path: '/api/vehicles/refund', vehicleId: 'vehicle-1', refundAmount: 20 }
      },
      {
        name: 'refund amount 20 then 12',
        first: { path: '/api/vehicles/refund', vehicleId: 'vehicle-1', refundAmount: 20 },
        second: { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 12 }
      }
    ];

    for (const scenario of scenarios) {
      mockDb.clear();
      seedVehicleFixture();

      const firstResponse = await callVehicleOperation(scenario.first);
      expect(firstResponse.status, scenario.name).toBe(200);
      expect(await firstResponse.json(), scenario.name).toMatchObject({ success: true });
      const afterFirst = recordSnapshot();
      const writesAfterFirst = mockDb.documentWriteCount;

      const conflictingResponse = await callVehicleOperation(scenario.second);
      expect(conflictingResponse.status, scenario.name).toBe(409);
      expect(await conflictingResponse.json(), scenario.name).toMatchObject({
        success: false,
        code: 'IDEMPOTENCY_KEY_REUSE'
      });
      expect(mockDb.documentWriteCount, scenario.name).toBe(writesAfterFirst);
      expect(recordSnapshot(), scenario.name).toEqual(afterFirst);
    }
  });

  it('rejects malformed refund amounts before any transactional write', async () => {
    const invalidAmounts: Array<number | string> = [-0.01, 12.345, '12.345', 'Infinity', 'not-money'];

    for (const refundAmount of invalidAmounts) {
      mockDb.clear();
      seedVehicleFixture(['vehicle-1']);
      const before = recordSnapshot();
      const writesBefore = mockDb.documentWriteCount;

      const response = await callVehicleOperation({ path: '/api/vehicles/refund', vehicleId: 'vehicle-1', refundAmount });
      expect(response.status, String(refundAmount)).toBe(400);
      expect(await response.json(), String(refundAmount)).toMatchObject({ success: false, error: 'INVALID_REFUND_AMOUNT' });
      expect(mockDb.documentWriteCount, String(refundAmount)).toBe(writesBefore);
      expect(recordSnapshot(), String(refundAmount)).toEqual(before);
    }
  });

  it('restores prepaid credits once when a refunded vehicle operation is replayed', async () => {
    seedVehicleFixture(['vehicle-1']);
    const garagePath = `garages/${garageId}`;
    const vehiclePath = `garages/${garageId}/vehicles/vehicle-1`;
    mockDb.seed(garagePath, {
      ...mockDb.records.get(garagePath),
      creditBalance: { paid: 5, referral: 0, trial: 0 }
    });
    mockDb.seed(vehiclePath, {
      ...mockDb.records.get(vehiclePath),
      creditDebit: { amount: 1, bucket: 'paid', ledgerEntryId: 'original-credit-entry' }
    });

    const refund = { path: '/api/vehicles/delete', vehicleId: 'vehicle-1', refundAmount: 12 } as const;
    const firstResponse = await callVehicleOperation(refund);
    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toMatchObject({ success: true });
    expect(mockDb.records.get(garagePath).creditBalance).toEqual({ paid: 6, referral: 0, trial: 0 });

    const creditEntries = [...mockDb.records.entries()]
      .filter(([path]) => path.startsWith('credit_ledger/'))
      .map(([, value]) => value);
    expect(creditEntries).toHaveLength(1);
    expect(creditEntries[0]).toMatchObject({
      kind: 'correction_restore',
      bucket: 'paid',
      amount: 1,
      balanceBefore: 5,
      balanceAfter: 6
    });

    const afterFirst = recordSnapshot();
    const writesAfterFirst = mockDb.documentWriteCount;
    const retryResponse = await callVehicleOperation({ ...refund, path: '/api/vehicles/refund', refundAmount: '12.00' });
    expect(retryResponse.status).toBe(200);
    expect(await retryResponse.json()).toMatchObject({ success: true });
    expect(mockDb.documentWriteCount).toBe(writesAfterFirst);
    expect(recordSnapshot()).toEqual(afterFirst);
    expect(mockDb.records.get(garagePath).creditBalance).toEqual({ paid: 6, referral: 0, trial: 0 });
  });
});
