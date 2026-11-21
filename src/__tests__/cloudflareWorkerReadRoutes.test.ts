import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';
import { __resetAllAuthCachesForTests } from '../../server/authCache';

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

describe('CF4 — Cloudflare Worker Read-Heavy Business Routes', () => {
  const operatorToken = 'test-operator-token-32-chars-long!!';
  const workerEnv = { BACKEND_OPERATOR_TOKEN: operatorToken };

  beforeEach(() => {
    mockDb.clear();
    // PR-F: reset auth caches between tests so each test sees a fresh
    // (uncached) auth flow.
    __resetAllAuthCachesForTests();
    mockDb.seed('garages/test-garage', {
      name: 'Summary Test Garage',
      hourlyRate: 10,
      overnightRate: 50,
      status: 'approved',
      dailyCapacity: 40
    });
  });

  // Ported from the removed /api/check-subscriber route tests (2026-11-21):
  // lookupSubscriber's precedence contract now lives on the live
  // /api/subscribers/add route, which uses it to reject duplicate plates.
  it('subscriber add rejects a duplicate plate found via the canonical document id', async () => {
    const plateRaw = 'ABC123';
    const canonicalId = `plate_${Buffer.from(plateRaw).toString('base64url')}`;
    mockDb.seed(`garages/test-garage/subscribers/${canonicalId}`, {
      plateNumber: 'ABC 123', plateNumberRaw: plateRaw, phone: '01000000001',
      startDate: '2026-10-01', endDate: '2026-10-31'
    });

    const res = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({
        garageId: 'test-garage',
        subscriberData: { plateNumber: 'ABC 123', startDate: '2026-11-01', endDate: '2026-11-30' }
      })
    }));
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
  });

  it('subscriber add still finds a duplicate via the legacy plateNumberRaw fallback', async () => {
    // Same plate but stored under a non-canonical (legacy) document id.
    mockDb.seed('garages/test-garage/subscribers/legacy-raw', {
      plateNumber: 'ABC 123', plateNumberRaw: 'ABC123', phone: '01000000002',
      startDate: '2026-10-01', endDate: '2026-10-31'
    });

    const res = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({
        garageId: 'test-garage',
        subscriberData: { plateNumber: 'ABC 123', startDate: '2026-11-01', endDate: '2026-11-30' }
      })
    }));
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
  });

  it('subscriber add still finds a duplicate via the formatted plateNumber fallback', async () => {
    // Legacy doc whose plateNumberRaw differs but formatted plate matches.
    mockDb.seed('garages/test-garage/subscribers/legacy-formatted', {
      plateNumber: 'ABC 123', plateNumberRaw: 'DIFFERENT', phone: '01000000003',
      startDate: '2026-10-01', endDate: '2026-10-31'
    });

    const res = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({
        garageId: 'test-garage',
        subscriberData: { plateNumber: 'ABC 123', startDate: '2026-11-01', endDate: '2026-11-30' }
      })
    }));
    expect(res.status).toBe(409);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
  });

  it('subscriber add creates the deterministic canonical document when no duplicate exists', async () => {
    const plateRaw = 'XYZ999';
    const canonicalId = `plate_${Buffer.from(plateRaw).toString('base64url')}`;

    const res = await api.fetch(new Request('http://localhost/api/subscribers/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-admin-token' },
      body: JSON.stringify({
        garageId: 'test-garage',
        subscriberData: { plateNumber: 'XYZ 999', startDate: '2026-11-01', endDate: '2026-11-30', ownerName: 'Owner', phone: '01000000004' }
      })
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.id).toBe(canonicalId);

    const stored = mockDb.records.get(`garages/test-garage/subscribers/${canonicalId}`);
    expect(stored).toMatchObject({ plateNumber: 'XYZ 999', plateNumberRaw: plateRaw });
  });

  it('GET /api/admin/delegates returns paginated delegates without PIN fields', async () => {
    // Seed a couple of delegates
    mockDb.seed('delegates/del-1', { id: 'del-1', name: 'Delegate One', phone: '01011112222', pin: '12345', pinHash: 'hash', createdAt: new Date('2026-10-01') });
    mockDb.seed('delegates/del-2', { id: 'del-2', name: 'Delegate Two', phone: '01099998888', pin: '67890', pinHash: 'hash', createdAt: new Date('2026-10-02') });

    const res = await api.fetch(new Request('http://localhost/api/admin/delegates?limit=10', {
      headers: { Authorization: 'Bearer valid-admin-token' }
    }), workerEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.delegates).toHaveLength(2);
    // Ordered by createdAt desc — Delegate Two first
    expect(body.delegates[0]).toMatchObject({ name: 'Delegate Two' });
    expect(body.delegates[1]).toMatchObject({ name: 'Delegate One' });
    // PIN fields must be stripped
    expect(body.delegates[0]).not.toHaveProperty('pin');
    expect(body.delegates[0]).not.toHaveProperty('pinHash');
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    // Perf audit F1: the duplicated `items` alias is no longer sent.
    expect(body.items).toBeUndefined();
  });

});
