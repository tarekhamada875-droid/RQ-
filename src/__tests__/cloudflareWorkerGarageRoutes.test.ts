import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

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

describe('CF8 — Cloudflare Worker Garage Management & Final Hardening Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };
  const testGarageId = 'worker-test-garage-cf8';

  beforeEach(async () => {
    mockDb.clear();
    mockDb.seed(`garages/${testGarageId}`, {
      name: 'Existing Hardening Garage',
      hourlyRate: 10,
      overnightRate: 50,
      status: 'approved',
      dailyCapacity: 40
    });
  });

  const startDeletion = (garageId: string) => api.fetch(new Request('http://localhost/api/garages/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
    body: JSON.stringify({ garageId })
  }), workerEnv);

  const stepDeletion = (garageId: string, jobToken: string, token = 'valid-admin-token') => api.fetch(new Request('http://localhost/api/garages/delete-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ garageId, jobToken })
  }), workerEnv);

  const completeDeletion = async (garageId: string, jobToken: string) => {
    for (let index = 0; index < 100; index += 1) {
      const response = await stepDeletion(garageId, jobToken);
      const body = await response.json() as any;
      expect(response.status).toBe(200);
      if (body.status === 'completed') return body;
      expect(body.status).toBe('running');
    }
    throw new Error('Synthetic garage deletion did not complete within 100 bounded steps');
  };

  it('serves read-only reconciliation diagnostics for Admin with Cairo-day event boundaries', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const dayStart = new Date(`${today}T00:00:00+03:00`);
    const eventAt = (minutesAfterStart: number) => new Date(dayStart.getTime() + minutesAfterStart * 60_000).toISOString();
    mockDb.seed(`garages/${testGarageId}`, {
      carsInside: 2, lastTransactionDate: today, todayCount: 1, todayRevenue: 45
    });
    mockDb.seed(`garages/${testGarageId}/daily_stats/${today}`, { count: 1, exitsCount: 1, revenue: 45 });
    mockDb.seed(`garages/${testGarageId}/vehicles/inside-1`, { status: 'inside' });
    mockDb.seed(`garages/${testGarageId}/vehicles/inside-2`, { status: 'inside' });
    mockDb.seed(`garages/${testGarageId}/vehicles/outside`, { status: 'outside' });
    mockDb.seed(`garages/${testGarageId}/events/enter`, { occurredAt: eventAt(1), eventType: 'vehicle_entered' });
    mockDb.seed(`garages/${testGarageId}/events/exit`, { occurredAt: eventAt(2), eventType: 'vehicle_exited', payload: { cost: 50 } });
    mockDb.seed(`garages/${testGarageId}/events/refund`, { occurredAt: eventAt(3), eventType: 'vehicle_refunded', payload: { refundAmount: 5 } });
    mockDb.seed(`garages/${testGarageId}/events/before-day`, { occurredAt: new Date(dayStart.getTime() - 1).toISOString(), eventType: 'vehicle_entered' });
    mockDb.seed(`garages/${testGarageId}/events/next-day`, { occurredAt: new Date(dayStart.getTime() + 24 * 60 * 60_000).toISOString(), eventType: 'vehicle_entered' });
    const recordsBefore = new Map([...mockDb.records.entries()].map(([path, data]) => [path, structuredClone(data)]));

    const response = await api.fetch(new Request('http://localhost/api/garages/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: testGarageId })
    }), workerEnv);
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        garageId: testGarageId,
        date: today,
        expected: { carsInside: 2, todayCount: 1, todayRevenue: 45 },
        actual: { carsInside: 2, todayCount: 1, todayRevenue: 45 },
        eventLedgerSummary: {
          totalRecordedEvents: 3, todayEnters: 1, todayExits: 1, todayRefunds: 1,
          eventGrossRevenue: 50, eventRefundRevenue: 5, eventDerivedRevenue: 45
        },
        operationalStateConsistent: true,
        dailyStatsConsistent: true,
        eventLedgerConsistent: true,
        overallConsistent: true,
        isConsistent: true
      }
    });
    expect([...mockDb.records.entries()]).toEqual([...recordsBefore.entries()]);
  });

  it('requires an authenticated Admin for reconciliation and rejects backend-operator mutations', async () => {
    const unauthenticated = await api.fetch(new Request('http://localhost/api/garages/reconciliation', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ garageId: testGarageId })
    }), workerEnv);
    expect(unauthenticated.status).toBe(401);

    for (const token of ['valid-garage-token-garage-a', 'valid-staff-token-garage-a', 'valid-delegate-token', 'valid-worker-token']) {
      const response = await api.fetch(new Request('http://localhost/api/garages/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ garageId: testGarageId })
      }), workerEnv);
      if (token === 'valid-worker-token') {
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED', code: 'SESSION_REVOKED', statusCode: 401 });
      } else {
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Admin role required', code: 'FORBIDDEN', statusCode: 403 });
      }
    }

    const operator = await api.fetch(new Request('http://localhost/api/garages/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Backend-Operator-Token': operatorToken },
      body: JSON.stringify({ garageId: testGarageId })
    }), workerEnv);
    expect(operator.status).toBe(403);
    expect(await operator.json()).toMatchObject({ success: false, error: expect.stringContaining('Mutating operations') });
  });

  it('matches validation and missing-garage error contracts without writes', async () => {
    const invalid = await api.fetch(new Request('http://localhost/api/garages/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: 'invalid/id' })
    }), workerEnv);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ success: false, error: 'Invalid characters in garageId' });

    const missing = await api.fetch(new Request('http://localhost/api/garages/reconciliation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: 'missing-reconciliation-garage' })
    }), workerEnv);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ success: false, error: 'GARAGE_NOT_FOUND' });
  });

  it('1. POST /api/garages/create creates new garage record and pin', async () => {
    // Unauthenticated
    const unauthRes = await api.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Test Garage', pin: '9876' })
    }));
    expect(unauthRes.status).toBe(401);

    const testPin = String(Math.floor(10000000 + Math.random() * 90000000));
    const createRes = await api.fetch(new Request('http://localhost/api/garages/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
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
    const updateRes = await api.fetch(new Request('http://localhost/api/garages/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
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

  it('2a. POST /api/garages/:id/extend-fair-use aliases the Hono admin fair-use handler', async () => {
    mockDb.seed(`garages/${testGarageId}`, {
      name: 'Unlimited Garage',
      dailyCapacity: 0,
      activePackageName: 'باقة مفتوحة',
      durationDays: 30,
      unlimitedFairUse: {
        isActive: true,
        tierType: 'monthly',
        cycleCarsCount: 40,
        currentAllowance: 1000,
        maxAllowance: 5000,
        stepAmount: 1000,
        threshold: 100,
        extensionsCount: 0
      }
    });

    const response = await api.fetch(new Request(`http://localhost/api/garages/${testGarageId}/extend-fair-use`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({ extraCars: 250 })
    }), workerEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, unlimitedFairUse: { maxAllowance: 5250, currentAllowance: 1250 } });
    expect([...mockDb.records.values()].some((record) => record.actionType === 'fair_use_admin_extended')).toBe(true);
  });

  it('2b. denies non-admin fair-use extension without writing', async () => {
    const response = await api.fetch(new Request(`http://localhost/api/garages/${testGarageId}/extend-fair-use`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-garage-token-garage-a'
      },
      body: JSON.stringify({ extraCars: 250 })
    }), workerEnv);

    expect(response.status).toBe(403);
    expect([...mockDb.records.values()].some((record) => record.actionType === 'fair_use_admin_extended')).toBe(false);
  });

  it('2c. rejects finite packages and missing garages without writing', async () => {
    mockDb.seed(`garages/${testGarageId}`, { name: 'Finite Garage', dailyCapacity: 50, activePackageName: 'باقة شهرية' });
    const finite = await api.fetch(new Request(`http://localhost/api/garages/${testGarageId}/extend-fair-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-admin-token' },
      body: JSON.stringify({ extraCars: 250 })
    }), workerEnv);
    expect(finite.status).toBe(400);
    expect(await finite.json()).toMatchObject({ success: false, error: 'تمديد الاستخدام العادل متاح للباقات المفتوحة فقط' });

    const missing = await api.fetch(new Request('http://localhost/api/garages/missing-fair-use/extend-fair-use', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-admin-token' },
      body: JSON.stringify({ extraCars: 250 })
    }), workerEnv);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ success: false, error: 'الجراج غير موجود' });
  });

  it('2d. uses the configured fair-use step when extraCars is omitted', async () => {
    mockDb.seed(`garages/${testGarageId}`, {
      name: 'Unlimited Garage',
      dailyCapacity: 0,
      activePackageName: 'باقة مفتوحة',
      unlimitedFairUse: {
        isActive: true, tierType: 'monthly', cycleCarsCount: 40, currentAllowance: 1000,
        maxAllowance: 5000, stepAmount: 1000, threshold: 100, extensionsCount: 0
      }
    });
    const response = await api.fetch(new Request(`http://localhost/api/admin/garages/${testGarageId}/extend-fair-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-admin-token' },
      body: JSON.stringify({})
    }), workerEnv);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, unlimitedFairUse: { maxAllowance: 6000, currentAllowance: 2000 } });
  });

  it('2e. replays a keyed fair-use extension without applying it twice', async () => {
    mockDb.seed(`garages/${testGarageId}`, {
      name: 'Unlimited Garage', dailyCapacity: 0, activePackageName: 'باقة مفتوحة',
      unlimitedFairUse: {
        isActive: true, tierType: 'monthly', cycleCarsCount: 40, currentAllowance: 1000,
        maxAllowance: 5000, stepAmount: 1000, threshold: 100, extensionsCount: 0
      }
    });
    const request = () => api.fetch(new Request(`http://localhost/api/garages/${testGarageId}/extend-fair-use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-admin-token' },
      body: JSON.stringify({ extraCars: 250, idempotencyKey: 'fair-use-replay-key-001' })
    }), workerEnv);

    const first = await request();
    const firstBody = await first.json() as any;
    const second = await request();
    const secondBody = await second.json() as any;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondBody).toEqual(firstBody);
    expect(mockDb.records.get(`garages/${testGarageId}`)?.unlimitedFairUse).toMatchObject({ maxAllowance: 5250, currentAllowance: 1250 });
    expect([...mockDb.records.values()].filter((record) => record.actionType === 'fair_use_admin_extended')).toHaveLength(1);
  });

  it('2f. rejects reusing a fair-use idempotency key with a different payload', async () => {
    mockDb.seed(`garages/${testGarageId}`, {
      name: 'Unlimited Garage', dailyCapacity: 0, activePackageName: 'باقة مفتوحة',
      unlimitedFairUse: {
        isActive: true, tierType: 'monthly', cycleCarsCount: 40, currentAllowance: 1000,
        maxAllowance: 5000, stepAmount: 1000, threshold: 100, extensionsCount: 0
      }
    });
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-admin-token' };
    const first = await api.fetch(new Request(`http://localhost/api/admin/garages/${testGarageId}/extend-fair-use`, {
      method: 'POST', headers, body: JSON.stringify({ extraCars: 250, idempotencyKey: 'fair-use-reuse-key-001' })
    }), workerEnv);
    expect(first.status).toBe(200);

    const reused = await api.fetch(new Request(`http://localhost/api/admin/garages/${testGarageId}/extend-fair-use`, {
      method: 'POST', headers, body: JSON.stringify({ extraCars: 500, idempotencyKey: 'fair-use-reuse-key-001' })
    }), workerEnv);
    expect(reused.status).toBe(409);
    expect([...mockDb.records.values()].filter((record) => record.actionType === 'fair_use_admin_extended')).toHaveLength(1);
  });

  it('3. POST /api/garages/delete starts a resumable job; bounded steps remove only owned data and complete it', async () => {
    for (let index = 0; index < 401; index += 1) {
      mockDb.seed(`garages/${testGarageId}/vehicles/vehicle-${index}`, { plateNumber: `TEST${index}` });
    }
    mockDb.seed(`garages/${testGarageId}/subscribers/subscriber-1`, { plateNumber: 'TEST-SUBSCRIBER' });
    mockDb.seed(`activity_logs/old-garage-log`, { garageId: testGarageId, actionType: 'old' });
    mockDb.seed(`recharge_requests/garage-request`, { garageId: testGarageId });
    mockDb.seed(`staff/garage-staff`, { garageId: testGarageId });
    mockDb.seed(`garage_sessions/garage-session`, { entityId: testGarageId });
    mockDb.seed(`private_pins/garage-pin`, { entityId: testGarageId, entityType: 'garages' });
    mockDb.seed(`pin_reservations/garage-pin-reservation`, { entityId: testGarageId, entityType: 'garages' });
    mockDb.seed(`private_pins/unrelated-pin`, { entityId: testGarageId, entityType: 'staff' });

    const deleteRes = await startDeletion(testGarageId);
    expect(deleteRes.status).toBe(202);
    const body = await deleteRes.json() as any;
    expect(body).toMatchObject({ success: true, garageId: testGarageId, status: 'running', phase: 'preparing', processedRecords: 0 });
    expect(body.jobToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(mockDb.records.has(`garages/${testGarageId}/vehicles/vehicle-0`)).toBe(true);
    expect(mockDb.records.get(`garage_deletion_jobs/${testGarageId}`)?.executionMode).toBe('client_steps');

    const firstStepResponse = await stepDeletion(testGarageId, body.jobToken);
    expect(firstStepResponse.status).toBe(200);
    expect(await firstStepResponse.json()).toMatchObject({
      success: true, status: 'running', phase: 'deleting', processedRecords: 200, deletedThisStep: 200
    });
    const completed = await completeDeletion(testGarageId, body.jobToken);
    expect(completed).toMatchObject({ success: true, status: 'completed', phase: 'complete' });

    expect(mockDb.records.has(`garages/${testGarageId}`)).toBe(false);
    expect([...mockDb.records.keys()].some((path) => path.startsWith(`garages/${testGarageId}/vehicles/`))).toBe(false);
    expect(mockDb.records.has(`garages/${testGarageId}/subscribers/subscriber-1`)).toBe(false);
    expect(mockDb.records.has('recharge_requests/garage-request')).toBe(false);
    expect(mockDb.records.has('staff/garage-staff')).toBe(false);
    expect(mockDb.records.has('garage_sessions/garage-session')).toBe(false);
    expect(mockDb.records.has('private_pins/garage-pin')).toBe(false);
    expect(mockDb.records.has('pin_reservations/garage-pin-reservation')).toBe(false);
    expect(mockDb.records.has('private_pins/unrelated-pin')).toBe(true);
    expect(mockDb.records.get(`garage_deletion_jobs/${testGarageId}`)?.status).toBe('completed');
    const deletionLogs = [...mockDb.records.entries()].filter(([path, data]) => path.startsWith('activity_logs/') && data.garageId === testGarageId);
    expect(deletionLogs).toHaveLength(1);
    expect(deletionLogs[0][1].actionType).toBe('garage_delete');
  });

  it('returns a running job and reports actual deletion counts through the Admin-only status route', async () => {
    for (let index = 0; index < 3; index += 1) {
      mockDb.seed(`garages/${testGarageId}/vehicles/progress-${index}`, { plateNumber: `PROGRESS${index}` });
    }
    const start = await startDeletion(testGarageId);
    expect(start.status).toBe(202);
    const startBody = await start.json() as any;
    expect(startBody).toMatchObject({ success: true, garageId: testGarageId, status: 'running', processedRecords: 0 });
    expect(mockDb.records.get(`garage_deletion_jobs/${testGarageId}`)?.status).toBe('running');

    const firstStep = await stepDeletion(testGarageId, startBody.jobToken);
    expect(await firstStep.json()).toMatchObject({ status: 'running', phase: 'deleting', processedRecords: 3 });
    const status = await api.fetch(new Request(`http://localhost/api/garages/delete-status?garageId=${testGarageId}`, {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ success: true, garageId: testGarageId, status: 'running', phase: 'deleting', processedRecords: 3 });

    await completeDeletion(testGarageId, startBody.jobToken);
    const completedStatus = await api.fetch(new Request(`http://localhost/api/garages/delete-status?garageId=${testGarageId}`, {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(await completedStatus.json()).toMatchObject({
      success: true, garageId: testGarageId, status: 'completed', phase: 'complete', processedRecords: 3, retryable: false
    });

    const deniedStatus = await api.fetch(new Request(`http://localhost/api/garages/delete-status?garageId=${testGarageId}`, {
      headers: { Authorization: 'Bearer valid-staff-token-garage-a' }
    }), workerEnv);
    expect(deniedStatus.status).toBe(403);
    const deniedStep = await stepDeletion(testGarageId, startBody.jobToken, 'valid-staff-token-garage-a');
    expect(deniedStep.status).toBe(403);
  });

  it('resumes a client-step job with its token and does not overlap a still-active legacy background job', async () => {
    const firstStart = await startDeletion(testGarageId);
    const firstBody = await firstStart.json() as any;
    const resumedStart = await startDeletion(testGarageId);
    const resumedBody = await resumedStart.json() as any;
    expect(firstStart.status).toBe(202);
    expect(resumedStart.status).toBe(202);
    expect(resumedBody.jobToken).toBe(firstBody.jobToken);
    await completeDeletion(testGarageId, resumedBody.jobToken);

    const legacyGarageId = 'legacy-active-delete-test';
    mockDb.seed(`garages/${legacyGarageId}`, { name: 'Legacy active garage', isDeleting: true });
    mockDb.seed(`garage_deletion_jobs/${legacyGarageId}`, {
      garageId: legacyGarageId,
      garageName: 'Legacy active garage',
      status: 'running',
      phase: 'deleting',
      leaseToken: '11111111-1111-4111-8111-111111111111',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      processedRecords: 0
    });
    const legacyStart = await startDeletion(legacyGarageId);
    expect(legacyStart.status).toBe(409);
    expect(await legacyStart.json()).toMatchObject({ code: 'GARAGE_DELETION_STILL_RUNNING', statusCode: 409 });
    expect(mockDb.records.get(`garage_deletion_jobs/${legacyGarageId}`)?.leaseToken).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('returns machine-readable codes for missing deletion targets and denied status reads', async () => {
    const missingStart = await api.fetch(new Request('http://localhost/api/garages/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId: 'missing-garage' })
    }), workerEnv);
    expect(missingStart.status).toBe(404);
    expect(await missingStart.json()).toMatchObject({ success: false, code: 'GARAGE_NOT_FOUND', statusCode: 404 });

    const invalidGarageId = await stepDeletion('invalid garage id', 'not-a-job-token');
    expect(invalidGarageId.status).toBe(400);
    expect(mockDb.records.has('garage_deletion_jobs/')).toBe(false);
    const invalidJobToken = await stepDeletion(testGarageId, 'not-a-job-token');
    expect(invalidJobToken.status).toBe(400);
    expect(await invalidJobToken.json()).toMatchObject({ code: 'INVALID_DELETION_JOB_TOKEN', statusCode: 400 });
    expect(mockDb.records.has(`garage_deletion_jobs/${testGarageId}`)).toBe(false);

    const missingStatus = await api.fetch(new Request(`http://localhost/api/garages/delete-status?garageId=missing-garage`, {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(missingStatus.status).toBe(404);
    expect(await missingStatus.json()).toMatchObject({ success: false, code: 'DELETION_JOB_NOT_FOUND', statusCode: 404 });

    const deniedStatus = await api.fetch(new Request('http://localhost/api/garages/delete-status?garageId=any-garage', {
      headers: { Authorization: 'Bearer valid-staff-token-garage-a' }
    }), workerEnv);
    expect(deniedStatus.status).toBe(403);
    expect(await deniedStatus.json()).toMatchObject({ success: false, code: 'FORBIDDEN', statusCode: 403 });
  });

  it('records a safe failure after a partial batch and resumes without deleting unrelated records', async () => {
    for (let index = 0; index < 401; index += 1) {
      mockDb.seed(`garages/${testGarageId}/vehicles/retry-${index}`, { plateNumber: `RETRY${index}` });
    }
    mockDb.seed('garages/other-garage', { name: 'Must remain' });
    const start = await startDeletion(testGarageId);
    const startBody = await start.json() as any;
    expect(start.status).toBe(202);
    const firstStep = await stepDeletion(testGarageId, startBody.jobToken);
    expect(await firstStep.json()).toMatchObject({ status: 'running', processedRecords: 200 });

    const originalTransaction = mockDb.runTransaction.bind(mockDb);
    let failNextTransaction = true;
    mockDb.runTransaction = (async (callback: (transaction: any) => Promise<any>) => {
      if (failNextTransaction) {
        failNextTransaction = false;
        throw new Error('FIRESTORE_QUERY_FAILED:503');
      }
      return originalTransaction(callback);
    }) as any;

    const failed = await stepDeletion(testGarageId, startBody.jobToken);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ code: 'GARAGE_DELETION_QUERY_FAILED', statusCode: 500 });
    mockDb.runTransaction = originalTransaction as any;
    expect(mockDb.records.get(`garage_deletion_jobs/${testGarageId}`)).toMatchObject({
      status: 'failed', phase: 'failed', errorCode: 'GARAGE_DELETION_QUERY_FAILED', processedRecords: 200
    });
    expect(mockDb.records.has(`garages/${testGarageId}`)).toBe(true);
    expect(mockDb.records.has(`garages/${testGarageId}/vehicles/retry-0`)).toBe(false);
    expect(mockDb.records.has(`garages/${testGarageId}/vehicles/retry-400`)).toBe(true);
    expect(mockDb.records.has('garages/other-garage')).toBe(true);

    const retried = await startDeletion(testGarageId);
    expect(retried.status).toBe(202);
    const retryBody = await retried.json() as any;
    expect(retryBody.processedRecords).toBe(200);
    const completed = await completeDeletion(testGarageId, retryBody.jobToken);
    expect(completed).toMatchObject({ success: true, status: 'completed', processedRecords: 401 });
    expect(mockDb.records.has(`garages/${testGarageId}`)).toBe(false);
    expect(mockDb.records.has('garages/other-garage')).toBe(true);
    expect([...mockDb.records.entries()].filter(([path, data]) => path.startsWith('activity_logs/') && data.garageId === testGarageId)).toHaveLength(1);
  });

  it('4. POST /api/garages/delete resumes a running job after the garage root was removed', async () => {
    mockDb.records.delete(`garages/${testGarageId}`);
    mockDb.seed(`garage_deletion_jobs/${testGarageId}`, {
      garageId: testGarageId,
      garageName: 'Synthetic Resume Garage',
      status: 'running'
    });
    mockDb.seed(`garages/${testGarageId}/events/leftover-event`, { type: 'synthetic' });

    const deleteRes = await startDeletion(testGarageId);
    expect(deleteRes.status).toBe(202);
    const startBody = await deleteRes.json() as any;
    expect(startBody).toMatchObject({ success: true, status: 'running' });
    await completeDeletion(testGarageId, startBody.jobToken);
    expect(mockDb.records.has(`garages/${testGarageId}/events/leftover-event`)).toBe(false);
    expect(mockDb.records.get(`garage_deletion_jobs/${testGarageId}`)?.status).toBe('completed');
  });

  it('5. GET /api/garages and GET /api/garages/:id return live garage data', async () => {
    const listRes = await api.fetch(new Request('http://localhost/api/garages', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.garages)).toBe(true);

    const getRes = await api.fetch(new Request(`http://localhost/api/garages/${testGarageId}`, {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as any;
    expect(getBody.success).toBe(true);
    expect(getBody.garage.id).toBe(testGarageId);
  });
});
