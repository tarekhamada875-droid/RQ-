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

import { api } from '../../server/api';

const tokens = {
  admin: 'valid-admin-token',
  supervisor: 'valid-supervisor-token',
  delegate: 'valid-delegate-token',
  garage: 'valid-garage-token-garage-a',
  staff: 'valid-staff-token-garage-a'
} as const;

async function call(path: string, token: string, init: RequestInit = {}) {
  return api.fetch(new Request(`http://localhost${path}`, {
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
    ['delegate without garage principal scope', tokens.delegate, 403]
  ])('applies direct garage-read scope for %s', async (_label, token, expectedStatus) => {
    const response = await call('/api/garages/garage-a', token);
    expect(response.status).toBe(expectedStatus);
  });

  it.each([
    ['garage owner', tokens.garage],
    ['staff', tokens.staff],
    ['delegate', tokens.delegate]
  ])('denies %s from reading another garage by URL manipulation', async (_label, token) => {
    const response = await call('/api/garages/garage-b', token);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, error: 'FORBIDDEN: Garage scope required' });
  });

  it('blocks the retired Supervisor role from all protected reads', async () => {
    mockDb.seed('supervisor_sessions/sup-uid', {
      uid: 'sup-uid', role: 'supervisor', entityId: 'legacy-supervisor', sessionId: 'legacy-session', isActive: true
    });
    mockDb.seed('supervisors/legacy-supervisor', { id: 'legacy-supervisor', name: 'Preserved record' });

    for (const path of ['/api/garages', '/api/garages/garage-a', '/api/recharge-requests', '/api/admin/summary']) {
      const response = await call(path, tokens.supervisor);
      expect(response.status, path).toBe(403);
      expect(await response.json()).toMatchObject({ success: false, error: 'ROLE_RETIRED' });
    }
    expect(mockDb.records.get('supervisors/legacy-supervisor')?.name).toBe('Preserved record');
  });

  it('does not resolve or refresh a legacy Supervisor session for an anonymous Worker token', async () => {
    const legacySession = {
      uid: 'worker-uid', role: 'supervisor', entityId: 'legacy-supervisor',
      sessionId: 'legacy-supervisor-session', isActive: true, lastActive: 'preserve-this-value'
    };
    mockDb.seed('supervisor_sessions/worker-uid', legacySession);

    const response = await call('/api/admin/summary', 'valid-worker-token', {
      headers: { 'x-session-id': 'legacy-supervisor-session' }
    });

    expect(response.status).toBe(403);
    expect(mockDb.records.get('supervisor_sessions/worker-uid')).toEqual(legacySession);
  });

  it('does not let a legacy Supervisor session revoke another user session', async () => {
    const legacySession = {
      uid: 'worker-uid', role: 'supervisor', entityId: 'legacy-supervisor',
      sessionId: 'legacy-supervisor-session', isActive: true, lastActive: 'preserve-this-value'
    };
    const targetSession = { uid: 'target-uid', role: 'delegate', entityId: 'target-delegate', sessionId: 'target-session', isActive: true };
    const targetDelegate = { activeSessionIds: ['target-session'], currentSessionId: 'target-session' };
    mockDb.seed('supervisor_sessions/worker-uid', legacySession);
    mockDb.seed('delegate_sessions/target-uid', targetSession);
    mockDb.seed('delegate_sessions/target-uid/sessions/target-session', targetSession);
    mockDb.seed('delegates/target-delegate', targetDelegate);

    const response = await call('/api/auth/release-session', 'valid-worker-token', {
      method: 'POST',
      headers: { 'x-session-id': 'legacy-supervisor-session' },
      body: JSON.stringify({ uid: 'target-uid', sessionId: 'target-session', role: 'delegate', entityId: 'target-delegate' })
    });

    expect(response.status).toBe(403);
    expect(mockDb.records.get('supervisor_sessions/worker-uid')).toEqual(legacySession);
    expect(mockDb.records.get('delegate_sessions/target-uid')).toEqual(targetSession);
    expect(mockDb.records.get('delegate_sessions/target-uid/sessions/target-session')).toEqual(targetSession);
    expect(mockDb.records.get('delegates/target-delegate')).toEqual(targetDelegate);
  });

  it('omits retired Supervisor counts from the Admin summary and preserves legacy records', async () => {
    const legacyRecord = { id: 'legacy-supervisor', name: 'Preserved record', role: 'supervisor' };
    mockDb.seed('supervisors/legacy-supervisor', legacyRecord);

    const response = await call('/api/admin/summary', tokens.admin);
    const body = await response.json() as { summary?: Record<string, unknown> };

    expect(response.status).toBe(200);
    expect(body.summary).not.toHaveProperty('totalSupervisors');
    expect(mockDb.records.get('supervisors/legacy-supervisor')).toEqual(legacyRecord);
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

  it.each([tokens.delegate, tokens.garage, tokens.staff, tokens.supervisor])('denies %s from reading recharge requests', async (token) => {
    const response = await call('/api/recharge-requests', token);
    expect(response.status).toBe(403);
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

  it('allows a garage owner to submit the trial-expiry decision for the owned garage', async () => {
    const response = await call('/api/garages/trial-decision', tokens.garage, {
      method: 'POST',
      body: JSON.stringify({ garageId: 'garage-a', trialDecision: 'continued' })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(mockDb.records.get('garages/garage-a')).toMatchObject({ trialDecision: 'continued' });
  });

  it('denies a garage owner from submitting a trial decision for another garage', async () => {
    const response = await call('/api/garages/trial-decision', tokens.garage, {
      method: 'POST',
      body: JSON.stringify({ garageId: 'garage-b', trialDecision: 'declined' })
    });
    expect(response.status).toBe(403);
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
