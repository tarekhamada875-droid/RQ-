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

describe('CF4 — Cloudflare Worker Public and Read-Heavy Business Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };

  beforeEach(() => {
    mockDb.clear();
    mockDb.seed('garages/test-garage', {
      name: 'Summary Test Garage',
      hourlyRate: 10,
      overnightRate: 50,
      status: 'approved',
      dailyCapacity: 40
    });
  });

  it('1. POST /api/check-subscriber requires auth, enforces garage scope, and handles lookup validation', async () => {
    const unauthenticated = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId: 'test-garage', plateNumber: '123-abc' })
    }));
    expect(unauthenticated.status).toBe(401);

    // Missing garage ID
    const missingGarageRes = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ plateNumber: '123-abc' })
    }));
    expect(missingGarageRes.status).toBe(400);

    const crossGarageRes = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-garage-token-other-garage' },
      body: JSON.stringify({ garageId: 'test-garage', plateNumber: '123-abc' })
    }));
    expect(crossGarageRes.status).toBe(403);

    // Non-existent subscriber lookup returns empty match gracefully
    const notFoundRes = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({
        garageId: 'test-garage-non-existent',
        plateNumber: '9999-xyz'
      })
    }));
    expect(notFoundRes.status).toBe(200);
    const notFoundBody = await notFoundRes.json() as any;
    expect(notFoundBody.success).toBe(true);
    expect(notFoundBody.isSubscriber).toBe(false);
    expect(notFoundBody.isActive).toBe(false);
    expect(notFoundBody.subscriber).toBeNull();
  });

  it('uses the canonical subscriber document before bounded legacy queries and preserves precedence', async () => {
    const garageId = 'lookup-precedence-garage';
    const plateRaw = 'ABC123';
    mockDb.seed(`garages/${garageId}/subscribers/plate_${Buffer.from(plateRaw).toString('base64url')}`, {
      plateNumber: 'ABC 123', plateNumberRaw: plateRaw, phone: '01000000001', startDate: '2026-10-01', endDate: '2026-10-31'
    });
    mockDb.seed(`garages/${garageId}/subscribers/legacy-raw`, {
      plateNumber: 'ABC 123', plateNumberRaw: plateRaw, phone: '01000000002', startDate: '2026-10-01', endDate: '2026-10-31'
    });

    mockDb.resetDocumentCounts();
    const canonicalResponse = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId, plateNumber: 'ABC 123', plateRaw, phone: '01000000002' })
    }));
    const canonicalBody = await canonicalResponse.json() as any;

    expect(canonicalResponse.status).toBe(200);
    expect(canonicalBody.subscriber.id).toBe(`plate_${Buffer.from(plateRaw).toString('base64url')}`);
    expect(canonicalBody.subscriber).not.toHaveProperty('phone');
    expect(canonicalBody.subscriber).not.toHaveProperty('notes');
    expect(mockDb.documentReadCount).toBe(5); // four session-resolution reads plus one canonical lookup

    mockDb.clear();
    mockDb.seed(`garages/${garageId}/subscribers/legacy-raw`, {
      plateNumber: 'ABC 123', plateNumberRaw: plateRaw, phone: '01000000001', startDate: '2026-10-01', endDate: '2026-10-31'
    });
    mockDb.seed(`garages/${garageId}/subscribers/legacy-formatted`, {
      plateNumber: 'ABC 123', plateNumberRaw: 'DIFFERENT', phone: '01000000002', startDate: '2026-10-01', endDate: '2026-10-31'
    });
    mockDb.resetDocumentCounts();
    const fallbackResponse = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({ garageId, plateNumber: 'ABC 123', plateRaw, phone: '01000000002' })
    }));
    const fallbackBody = await fallbackResponse.json() as any;

    expect(fallbackBody.subscriber.id).toBe('legacy-raw');
    expect(mockDb.documentReadCount).toBe(8); // four session-resolution reads plus canonical, raw, formatted, and phone fallbacks
  });

  it('2. GET /api/garage-summary requires auth and returns garage summary', async () => {
    // Unauthenticated
    const unauthRes = await api.fetch(new Request('http://localhost/api/garage-summary?garageId=test-garage'));
    expect(unauthRes.status).toBe(401);

    // Authenticated with admin token
    const res = await api.fetch(new Request('http://localhost/api/garage-summary?garageId=test-garage', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    // Should return 200 with structured data
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
  });

  it('serves fresh maintained garage summary without collection scans', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    mockDb.seed('garages/test-garage/maintained_summary/current', {
      schemaVersion: 1, garageId: 'test-garage', name: 'Summary Test Garage', carsInside: 4,
      activeSubscribersCount: 3, totalSubscribersCount: 5, balanceExpiry: null, isTrial: false,
      dailyCapacity: 40, hourlyRate: 10
    });
    mockDb.seed(`garages/test-garage/maintained_summary/daily_${today}`, {
      schemaVersion: 1, garageId: 'test-garage', dateId: today, todayEntries: 12, todayRevenue: 80
    });

    const garageResponse = await api.fetch(new Request('http://localhost/api/garage-summary?garageId=test-garage', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(garageResponse.headers.get('X-Summary-Source')).toBe('maintained_summary');
    expect((await garageResponse.json() as any).data).toMatchObject({ carsInside: 4, activeSubscribersCount: 3, todayEntries: 12 });
  });

});
