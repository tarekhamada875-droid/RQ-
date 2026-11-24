/**
 * OFFLINE STEP 3 — true tap times reach the bank.
 *
 * The owner's debug file (rq-debug-2026-11-24-12-17-23.json) caught the
 * money bug: a car queued offline at 11:49 was stamped by the bank at
 * 12:16 (flush time). With hourly billing + the 5-minute grace period,
 * any long offline gap turned real stays into free ones (late-flushed
 * entries) or charged the drawer wait to the customer (late-flushed
 * exits). These tests pin the fix: the envelope's tap times drive the
 * vehicle stamp and the fee; the server clock is only the fallback.
 */
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

describe('Offline Step 3 — bank bills from the true tap times', () => {
  const workerEnv = { BACKEND_OPERATOR_TOKEN: 'test-operator-token-32-chars-long!!' };
  const garageId = 'worker-tap-time-garage';
  const adminHeaders = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer valid-admin-token',
  };

  beforeEach(() => {
    mockDb.clear();
    mockDb.seed(`garages/${garageId}`, {
      name: 'Tap Time Garage',
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

  it('check-in stamps the vehicle with the envelope entryTimeIso', async () => {
    // 6 hours ago — well inside the plausibility window (max 7 days back).
    const trueEntryIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

    const res = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        garageId,
        plateNumber: 'أ ب ج 1234',
        plateRaw: 'أبج1234',
        type: 'hourly',
        entryTimeIso: trueEntryIso,
        idempotencyKey: 'idemp_tap_entry_1',
      }),
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    // The bank wrote the phone's tap time, not its own flush-time clock.
    expect(body.data.vehicle.entryTime).toBe(trueEntryIso);
  });

  it('check-in falls back to the server clock on an implausible (future) entryTimeIso', async () => {
    // 10 minutes ahead — beyond the 2-minute skew tolerance.
    const bogusIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const res = await api.fetch(new Request('http://localhost/api/vehicles/check-in', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        garageId,
        plateNumber: 'أ ب ج 1234',
        plateRaw: 'أبج1234',
        type: 'hourly',
        entryTimeIso: bogusIso,
        idempotencyKey: 'idemp_tap_entry_2',
      }),
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    const stampedAt = new Date(body.data.vehicle.entryTime).getTime();
    expect(stampedAt).toBeGreaterThanOrEqual(Date.now() - 60_000);
    expect(stampedAt).toBeLessThanOrEqual(Date.now() + 2_000);
    // The bogus client time must NOT have been trusted.
    expect(body.data.vehicle.entryTime).not.toBe(bogusIso);
  });

  it('check-out bills the stay from exitTimeIso (3h at rate 10 → 30)', async () => {
    const entryAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    mockDb.seed(`garages/${garageId}/vehicles/أبج1234`, {
      id: 'أبج1234',
      plateNumber: 'أ ب ج 1234',
      plateNumberRaw: 'أبج1234',
      type: 'hourly',
      status: 'inside',
      entryTime: entryAt,
      isSubscriber: false,
    });
    // The true exit tap: exactly 3 hours after entry (≈ the flush moment).
    const trueExitIso = new Date(entryAt.getTime() + 3 * 60 * 60 * 1000).toISOString();

    const res = await api.fetch(new Request('http://localhost/api/vehicles/check-out', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        garageId,
        vehicleId: 'أبج1234',
        exitTimeIso: trueExitIso,
        idempotencyKey: 'idemp_tap_exit_1',
      }),
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    // ceil(3h) × rate 10 = 30 — NOT the drawer-wait-inflated fee.
    expect(body.data.cost).toBe(30);
  });

  it('check-out falls back to the server clock on an implausible (future) exitTimeIso', async () => {
    const entryAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    mockDb.seed(`garages/${garageId}/vehicles/أبج1234`, {
      id: 'أبج1234',
      plateNumber: 'أ ب ج 1234',
      plateNumberRaw: 'أبج1234',
      type: 'hourly',
      status: 'inside',
      entryTime: entryAt,
      isSubscriber: false,
    });
    // 10 minutes ahead — beyond the skew tolerance. The bank must ignore it
    // and bill from its own clock (≈3h stay → ceil to 4 hours).
    const bogusExitIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const res = await api.fetch(new Request('http://localhost/api/vehicles/check-out', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        garageId,
        vehicleId: 'أبج1234',
        exitTimeIso: bogusExitIso,
        idempotencyKey: 'idemp_tap_exit_2',
      }),
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.cost).toBe(40);
  });
});
