import { describe, expect, it, beforeEach, vi } from 'vitest';
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

import { workerApp } from '../../server/cloudflareWorker';

const tokens = {
  admin: 'valid-admin-token',
  supervisor: 'valid-supervisor-token',
  delegate: 'valid-delegate-token',
  garage: 'valid-garage-token-garage-a',
  staff: 'valid-staff-token-garage-a'
} as const;

async function call(path: string, token: string, init: RequestInit = {}) {
  return workerApp.fetch(new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  }));
}

describe('Worker role and garage-scope authorization matrix', () => {
  beforeEach(() => {
    mockDb.clear();
    mockDb.seed('garages/garage-a', { id: 'garage-a', name: 'Garage Alpha' });
    mockDb.seed('garages/garage-b', { id: 'garage-b', name: 'Garage Beta' });
  });

  it.each([
    ['admin', tokens.admin, 200],
    ['garage owner in own garage', tokens.garage, 200],
    ['staff in assigned garage', tokens.staff, 200],
    ['delegate without garage principal scope', tokens.delegate, 403],
    ['supervisor without garage principal scope', tokens.supervisor, 403]
  ])('applies direct garage-read scope for %s', async (_label, token, expectedStatus) => {
    const response = await call('/api/garages/garage-a', token);
    expect(response.status).toBe(expectedStatus);
  });

  it.each([
    ['garage owner', tokens.garage],
    ['staff', tokens.staff],
    ['delegate', tokens.delegate],
    ['supervisor', tokens.supervisor]
  ])('denies %s from reading another garage by URL manipulation', async (_label, token) => {
    const response = await call('/api/garages/garage-b', token);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Garage scope required' });
  });

  it.each([
    ['/api/admin/summary', 'GET'],
    ['/api/financial-summary', 'GET'],
    ['/api/garages/delete', 'POST'],
    ['/api/transactions/admin-topup-balance', 'POST']
  ])('denies non-admin access to %s for every non-admin role', async (path, method) => {
    for (const token of [tokens.supervisor, tokens.delegate, tokens.garage, tokens.staff]) {
      const response = await call(path, token, {
        method,
        body: method === 'POST' ? JSON.stringify({ garageId: 'garage-a', amount: 10 }) : undefined
      });
      expect(response.status, `${path} with ${token}`).toBe(403);
    }
  });

  it.each([tokens.delegate, tokens.garage, tokens.staff])('denies %s from reading recharge requests while allowing the restricted supervisor role', async (token) => {
    const response = await call('/api/recharge-requests', token);
    expect(response.status).toBe(403);
  });

  it('allows the restricted supervisor role to read recharge requests', async () => {
    const response = await call('/api/recharge-requests', tokens.supervisor);
    expect(response.status).toBe(200);
  });

  it('does not trust a client-supplied role to elevate a garage owner', async () => {
    const response = await call('/api/admin/summary', tokens.garage, {
      headers: { 'x-test-role': 'admin' }
    });
    expect(response.status).toBe(403);
  });

  it('resolves a PIN-authenticated anonymous garage owner from the active server session', async () => {
    mockDb.seed('garage_sessions/worker-uid', {
      uid: 'worker-uid',
      role: 'garage',
      entityId: 'garage-a',
      garageId: 'garage-a',
      sessionId: 'garage-session-a',
      isActive: true
    });

    const own = await call('/api/garages/garage-a', 'valid-worker-token', {
      headers: { 'x-session-id': 'garage-session-a' }
    });
    expect(own.status).toBe(200);

    const crossGarage = await call('/api/garages/garage-b', 'valid-worker-token', {
      headers: { 'x-session-id': 'garage-session-a' }
    });
    expect(crossGarage.status).toBe(403);
  });

  it('resolves a PIN-authenticated anonymous admin from the active server session', async () => {
    mockDb.seed('admin_sessions/worker-uid', {
      uid: 'worker-uid',
      role: 'admin',
      entityId: 'auth_pin',
      sessionId: 'admin-session-a',
      isActive: true
    });

    const response = await call('/api/garages/garage-a', 'valid-worker-token', {
      headers: { 'x-session-id': 'admin-session-a' }
    });
    expect(response.status).toBe(200);
  });

  it('serves a live dashboard summary only within the caller garage scope', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    mockDb.seed('garages/garage-a/projection_buckets/bucket-1', {
      dateId: today,
      entriesToday: 3,
      exitsToday: 1,
      grossRevenue: 120,
      refundTotal: 10,
      netRevenue: 110
    });
    const own = await call('/api/garages/garage-a/dashboard-summary', tokens.garage);
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({
      success: true,
      data: { garageId: 'garage-a', summary: { entriesToday: 3, exitsToday: 1, grossRevenue: 120, refundTotal: 10, netRevenue: 110, source: 'live_projection_buckets' } }
    });

    const crossGarage = await call('/api/garages/garage-b/dashboard-summary', tokens.garage);
    expect(crossGarage.status).toBe(403);
  });
});
