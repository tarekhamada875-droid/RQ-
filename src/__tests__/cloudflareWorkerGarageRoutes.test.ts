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

  it('3. POST /api/garages/delete removes only owned data in bounded batches and completes the job', async () => {
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

    const deleteRes = await api.fetch(new Request('http://localhost/api/garages/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({
        garageId: testGarageId
      })
    }), workerEnv);

    expect(deleteRes.status).toBe(200);
    const body = await deleteRes.json() as any;
    expect(body.success).toBe(true);
    expect(body.deletionStarted).toBeUndefined();
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

  it('4. POST /api/garages/delete resumes a running job after the garage root was removed', async () => {
    mockDb.records.delete(`garages/${testGarageId}`);
    mockDb.seed(`garage_deletion_jobs/${testGarageId}`, {
      garageId: testGarageId,
      garageName: 'Synthetic Resume Garage',
      status: 'running'
    });
    mockDb.seed(`garages/${testGarageId}/events/leftover-event`, { type: 'synthetic' });

    const deleteRes = await api.fetch(new Request('http://localhost/api/garages/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-admin-token'
      },
      body: JSON.stringify({ garageId: testGarageId })
    }), workerEnv);

    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toMatchObject({ success: true });
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
