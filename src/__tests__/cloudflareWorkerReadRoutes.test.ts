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

  it('1. POST /api/check-subscriber handles subscriber lookup and validations', async () => {
    // Missing garage ID
    const missingGarageRes = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateNumber: '123-abc' })
    }));
    expect(missingGarageRes.status).toBe(400);

    // Non-existent subscriber lookup returns empty match gracefully
    const notFoundRes = await api.fetch(new Request('http://localhost/api/check-subscriber', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId, plateNumber: 'ABC 123', plateRaw, phone: '01000000002' })
    }));
    const canonicalBody = await canonicalResponse.json() as any;

    expect(canonicalResponse.status).toBe(200);
    expect(canonicalBody.subscriber.id).toBe(`plate_${Buffer.from(plateRaw).toString('base64url')}`);
    expect(mockDb.documentReadCount).toBe(1);

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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ garageId, plateNumber: 'ABC 123', plateRaw, phone: '01000000002' })
    }));
    const fallbackBody = await fallbackResponse.json() as any;

    expect(fallbackBody.subscriber.id).toBe('legacy-raw');
    expect(mockDb.documentReadCount).toBe(4); // canonical miss plus raw, formatted, and phone fallbacks
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

  it('serves fresh maintained garage, admin, and subscriber summaries without collection scans', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    mockDb.seed('garages/test-garage/maintained_summary/current', {
      schemaVersion: 1, garageId: 'test-garage', name: 'Summary Test Garage', carsInside: 4,
      activeSubscribersCount: 3, totalSubscribersCount: 5, balanceExpiry: null, isTrial: false,
      dailyCapacity: 40, hourlyRate: 10
    });
    mockDb.seed(`garages/test-garage/maintained_summary/daily_${today}`, {
      schemaVersion: 1, garageId: 'test-garage', dateId: today, todayEntries: 12, todayRevenue: 80
    });
    mockDb.seed('admin_summary/global', {
      schemaVersion: 1, totalGarages: 10, activeGarages: 8, lockedGarages: 1, totalDelegates: 4, totalAdminRevenue: 1200
    });
    mockDb.seed('subscriber_summary/global', {
      schemaVersion: 1, totalSubscribers: 50, activeSubscribers: 40, expiredSubscribers: 10, garagesCount: 9
    });

    const garageResponse = await api.fetch(new Request('http://localhost/api/garage-summary?garageId=test-garage', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(garageResponse.headers.get('X-Summary-Source')).toBe('maintained_summary');
    expect((await garageResponse.json() as any).data).toMatchObject({ carsInside: 4, activeSubscribersCount: 3, todayEntries: 12 });

    const adminResponse = await api.fetch(new Request('http://localhost/api/admin/summary', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(adminResponse.headers.get('X-Summary-Source')).toBe('maintained_summary');
    expect((await adminResponse.json() as any).summary).toMatchObject({ totalGarages: 10, totalDelegates: 4 });

    const subscriberResponse = await api.fetch(new Request('http://localhost/api/admin/monthly-subscribers-summary', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(subscriberResponse.headers.get('X-Summary-Source')).toBe('maintained_summary');
    expect((await subscriberResponse.json() as any).data).toMatchObject({ totalSubscribers: 50, activeSubscribers: 40 });
  });

  it('3. GET /api/admin/summary returns aggregated system statistics', async () => {
    // Unauthenticated
    const unauthRes = await api.fetch(new Request('http://localhost/api/admin/summary'));
    expect(unauthRes.status).toBe(401);

    // Authenticated as admin
    const res = await api.fetch(new Request('http://localhost/api/admin/summary', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.totalGarages).toBe('number');
    expect(typeof body.summary.activeGarages).toBe('number');
    expect(typeof body.summary.totalDelegates).toBe('number');
  });

  it('4. GET /api/admin/monthly-subscribers-summary aggregates subscriber metrics', async () => {
    const res = await api.fetch(new Request('http://localhost/api/admin/monthly-subscribers-summary', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(typeof body.data.totalSubscribers).toBe('number');
    expect(typeof body.data.activeSubscribers).toBe('number');
    expect(typeof body.data.expiredSubscribers).toBe('number');
  });

  it('5. GET /api/admin/subscribers lists subscriber records', async () => {
    const res = await api.fetch(new Request('http://localhost/api/admin/subscribers?limit=10', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.subscribers)).toBe(true);
    expect(typeof body.count).toBe('number');
  });

  it('6. GET /api/admin/delegates returns delegates list without PIN fields', async () => {
    // Seed some delegate data
    mockDb.seed('delegates/del-1', {
      name: 'Test Delegate',
      createdAt: new Date('2026-10-17T10:00:00.000Z'),
      pin: '12345678',
      ownerPin: '12345678',
      adminPin: '12345678',
      pinHash: 'xyz',
      commissionRate: 10
    });

    const res = await api.fetch(new Request('http://localhost/api/admin/delegates', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.delegates)).toBe(true);

    // Verify PIN fields are never leaked
    for (const delegate of body.delegates) {
      expect(delegate.pin).toBeUndefined();
      expect(delegate.ownerPin).toBeUndefined();
      expect(delegate.adminPin).toBeUndefined();
      expect(delegate.pinHash).toBeUndefined();
    }
  });

  it('paginates Admin delegates with a stable tie-break and reads only one page plus sentinel', async () => {
    for (let index = 0; index < 7; index += 1) {
      mockDb.seed(`delegates/page-${index}`, {
        name: `Delegate ${index}`,
        createdAt: new Date('2026-10-17T10:00:00.000Z')
      });
    }
    mockDb.resetDocumentCounts();

    const requestPage = (cursor?: string) => {
      const params = new URLSearchParams({ limit: '3' });
      if (cursor) params.set('cursor', cursor);
      return api.fetch(new Request(`http://localhost/api/admin/delegates?${params}`, {
        headers: { Authorization: 'Bearer valid-admin-token' }
      }), workerEnv);
    };
    const firstResponse = await requestPage();
    const first = await firstResponse.json() as any;
    expect(firstResponse.status).toBe(200);
    expect(first.delegates).toHaveLength(3);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(mockDb.queryResultSizes.at(-1)).toBe(4);

    const secondResponse = await requestPage(first.nextCursor);
    const second = await secondResponse.json() as any;
    expect(secondResponse.status).toBe(200);
    expect(second.delegates).toHaveLength(3);
    expect(second.delegates.map((item: any) => item.id)).not.toEqual(expect.arrayContaining(first.delegates.map((item: any) => item.id)));
    expect(mockDb.queryResultSizes.at(-1)).toBe(4);

    const thirdResponse = await requestPage(second.nextCursor);
    const third = await thirdResponse.json() as any;
    expect(third.delegates).toHaveLength(1);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBeNull();
    expect(mockDb.queryResultSizes.at(-1)).toBe(1);

    const allIds = [...first.delegates, ...second.delegates, ...third.delegates].map((item: any) => item.id);
    expect(new Set(allIds).size).toBe(7);
    expect(allIds).toEqual([...allIds].sort((left, right) => right.localeCompare(left)));
  });

  it('rejects malformed, expired, and cross-route page cursors', async () => {
    for (const cursor of ['not-a-token', 'a'.repeat(5000)]) {
      const response = await api.fetch(new Request(`http://localhost/api/admin/delegates?cursor=${cursor}`, {
        headers: { Authorization: 'Bearer valid-admin-token' }
      }), workerEnv);
      expect(response.status).toBe(400);
    }

    mockDb.seed('delegates/cursor-source', { createdAt: new Date('2026-10-17T10:00:00.000Z') });
    mockDb.seed('delegates/cursor-source-2', { createdAt: new Date('2026-10-16T10:00:00.000Z') });
    const firstResponse = await api.fetch(new Request('http://localhost/api/admin/delegates?limit=1', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    const first = await firstResponse.json() as any;
    const crossRoute = await api.fetch(new Request(`http://localhost/api/garages?cursor=${encodeURIComponent(first.nextCursor)}`, {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(crossRoute.status).toBe(400);
  });

  it('7. GET /api/admin/delegates/:id handles lookup and 404 on unknown delegate', async () => {
    const res = await api.fetch(new Request('http://localhost/api/admin/delegates/non-existent-delegate-id', {
      headers: { 'Authorization': 'Bearer valid-admin-token' }
    }), workerEnv);

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toBe('DELEGATE_NOT_FOUND');
  });

  it('bounds Admin delegate-detail child lists and supports section cursor continuation', async () => {
    mockDb.seed('delegates/del-page', { name: 'Paginated Detail Delegate' });
    for (let index = 0; index < 4; index += 1) {
      mockDb.seed(`garages/detail-created-${index}`, { createdByDelegateId: 'del-page', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
      mockDb.seed(`garages/detail-referred-${index}`, { referrerId: 'del-page', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
      mockDb.seed(`recharge_requests/detail-${index}`, { delegateId: 'del-page', createdAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - index * 60_000) });
    }
    mockDb.resetDocumentCounts();
    const response = await api.fetch(new Request('http://localhost/api/admin/delegates/del-page?limit=2', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    const first = await response.json() as any;
    expect(response.status).toBe(200);
    expect(first.garages).toHaveLength(4);
    expect(first.requests).toHaveLength(2);
    expect(first.pagination.createdGarages.hasMore).toBe(true);
    expect(first.pagination.referredGarages.hasMore).toBe(true);
    expect(first.pagination.requests.hasMore).toBe(true);
    expect(mockDb.queryResultSizes.slice(-3)).toEqual([3, 3, 3]);

    const params = new URLSearchParams({ section: 'createdGarages', limit: '2', cursor: first.pagination.createdGarages.nextCursor });
    const nextResponse = await api.fetch(new Request(`http://localhost/api/admin/delegates/del-page?${params}`, {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    const next = await nextResponse.json() as any;
    expect(nextResponse.status).toBe(200);
    expect(next.garages).toHaveLength(2);
    expect(next.garages.map((garage: any) => garage.id)).not.toEqual(expect.arrayContaining(first.garages.map((garage: any) => garage.id)));
  });
});
