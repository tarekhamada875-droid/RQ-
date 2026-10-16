import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MockFirestore, mockAdminAuth } from './mockFirestore';
import { hashSessionId } from '../../server/auth/sessionMarkers';

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
  staff: 'valid-staff-token-garage-a',
  viewer: 'valid-viewer-token',
  worker: 'valid-worker-token'
} as const;

async function call(path: string, token: string, init: RequestInit = {}) {
  const providedHeaders = (init.headers || {}) as Record<string, string>;
  let defaultSessionHeader: Record<string, string> = {};
  if (
    !Object.keys(providedHeaders).some((key) => key.toLowerCase() === 'x-session-id') &&
    ['valid-admin-token', 'valid-delegate-token', 'valid-garage-token-garage-a', 'valid-staff-token-garage-a'].includes(token)
  ) {
    const sessionId = `matrix-session-${token}`;
    const roleDetails = token === 'valid-admin-token'
      ? { uid: 'admin-uid', role: 'admin', entityId: 'auth_pin', sessions: 'admin_sessions', collection: 'admin_settings', documentId: 'auth_pin' }
      : token === 'valid-delegate-token'
        ? { uid: 'delegate-uid', role: 'delegate', entityId: 'delegate-a', sessions: 'delegate_sessions', collection: 'delegates', documentId: 'delegate-a' }
        : token === 'valid-garage-token-garage-a'
          ? { uid: 'garage-uid-garage-a', role: 'garage', entityId: 'garage-a', sessions: 'garage_sessions', collection: 'garages', documentId: 'garage-a' }
          : { uid: 'staff-uid-garage-a', role: 'staff', entityId: 'staff-a', garageId: 'garage-a', sessions: 'staff_sessions', collection: 'staff', documentId: 'staff-a' };
    mockDb.seed(`${roleDetails.sessions}/${roleDetails.uid}`, {
      uid: roleDetails.uid,
      role: roleDetails.role,
      entityId: roleDetails.entityId,
      ...(roleDetails.garageId ? { garageId: roleDetails.garageId } : {}),
      sessionId,
      isActive: true,
      lastActive: new Date()
    });
    const entityPath = `${roleDetails.collection}/${roleDetails.documentId}`;
    const currentEntity = mockDb.records.get(entityPath) || {};
    mockDb.seed(entityPath, {
      ...currentEntity,
      activeSessionIds: [...new Set([...(currentEntity.activeSessionIds || []), sessionId])],
      currentSessionId: sessionId
    });
    defaultSessionHeader = { 'x-session-id': sessionId };
  }
  return api.fetch(new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...defaultSessionHeader,
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
    ['admin', tokens.admin],
    ['delegate', tokens.delegate],
    ['garage', tokens.garage],
    ['staff', tokens.staff]
  ])('rejects a %s role claim without an active server session', async (_label, token) => {
    const response = await call('/api/garages/garage-a', token, { headers: { 'x-session-id': '' } });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED' });
  });

  it('checks only the verified role session paths for an active garage session', async () => {
    const documentPathSpy = vi.spyOn(mockDb, 'doc');
    try {
      const response = await call('/api/garages/garage-a', tokens.garage);
      expect(response.status).toBe(200);
      const requestedPaths = documentPathSpy.mock.calls.map(([path]) => path);
      expect(requestedPaths).toContain('garage_sessions/garage-uid-garage-a');
      expect(requestedPaths).not.toContain('admin_sessions/garage-uid-garage-a');
      expect(requestedPaths).not.toContain('delegate_sessions/garage-uid-garage-a');
      expect(requestedPaths).not.toContain('staff_sessions/garage-uid-garage-a');
    } finally {
      documentPathSpy.mockRestore();
    }
  });

  it('resolves an indexed garage session without probing the four legacy role collections', async () => {
    const sessionId = 'indexed-garage-session';
    const uid = 'garage-uid-garage-a';
    mockDb.seed(`session_index/${hashSessionId(`${uid}:${sessionId}`)}`, {
      uid,
      sessionHash: hashSessionId(sessionId),
      role: 'garage',
      entityCollection: 'garages',
      entityId: 'garage-a',
      garageId: 'garage-a',
      isActive: true,
      lastActive: new Date()
    });
    mockDb.seed(`garage_sessions/${uid}/sessions/${sessionId}`, {
      uid, role: 'garage', entityId: 'garage-a', sessionId, isActive: true, lastActive: new Date()
    });
    mockDb.seed('garages/garage-a', { id: 'garage-a', name: 'Garage Alpha', activeSessionIds: [sessionId] });

    const documentPathSpy = vi.spyOn(mockDb, 'doc');
    try {
      const response = await call('/api/garages/garage-a', tokens.garage, { headers: { 'x-session-id': sessionId } });
      expect(response.status).toBe(200);
      const requestedPaths = documentPathSpy.mock.calls.map(([path]) => path);
      expect(requestedPaths).toContain(`session_index/${hashSessionId(`${uid}:${sessionId}`)}`);
      expect(requestedPaths).toContain(`garage_sessions/${uid}/sessions/${sessionId}`);
      expect(requestedPaths).toContain('garages/garage-a');
      expect(requestedPaths).not.toContain(`garage_sessions/${uid}`);
      expect(requestedPaths).not.toContain(`admin_sessions/${uid}`);
      expect(requestedPaths).not.toContain(`delegate_sessions/${uid}`);
      expect(requestedPaths).not.toContain(`staff_sessions/${uid}`);
    } finally {
      documentPathSpy.mockRestore();
    }
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

  it.each([
    ['diagnostic viewer', tokens.viewer, 403, 'FORBIDDEN'],
    ['unresolved worker fallback', tokens.worker, 401, 'SESSION_REVOKED']
  ] as const)('returns a standard error envelope for %s principals', async (_label, token, status, code) => {
    const correlationId = `role-matrix-${_label.replace(/\s+/g, '-')}`;
    const response = await call('/api/admin/summary', token, {
      headers: { 'x-correlation-id': correlationId }
    });
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(status);
    expect(body).toMatchObject({
      success: false,
      code,
      statusCode: status,
      correlationId,
      timestamp: expect.any(String)
    });
    expect(typeof body.error).toBe('string');
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

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED' });
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

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED' });
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
      isActive: true,
      lastActive: new Date()
    });
    mockDb.seed('garages/garage-a', {
      id: 'garage-a', name: 'Garage Alpha', activeSessionIds: ['garage-session-a'], currentSessionId: 'garage-session-a'
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
      isActive: true,
      lastActive: new Date()
    });
    mockDb.seed('admin_settings/auth_pin', {
      activeSessionIds: ['admin-session-a'], currentSessionId: 'admin-session-a'
    });

    const response = await call('/api/garages/garage-a', 'valid-worker-token', {
      headers: { 'x-session-id': 'admin-session-a' }
    });
    expect(response.status).toBe(200);
  });

  it('rejects an anonymous Firebase token without a session identity', async () => {
    const response = await call('/api/admin/summary', 'valid-worker-token');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED' });
  });

  it('does not let a verified role claim override a supplied inactive session identity', async () => {
    const response = await call('/api/garages/garage-a', tokens.garage, {
      headers: { 'x-session-id': 'revoked-garage-session' }
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED' });
  });

  it('rejects a PIN session whose last active time is beyond the 24-hour limit', async () => {
    const sessionId = 'garage-session-expired';
    mockDb.seed('garage_sessions/worker-uid', {
      uid: 'worker-uid', role: 'garage', entityId: 'garage-a', garageId: 'garage-a',
      sessionId, isActive: true, lastActive: new Date(Date.now() - 25 * 60 * 60 * 1000)
    });
    mockDb.seed('garages/garage-a', { id: 'garage-a', activeSessionIds: [sessionId] });

    const response = await call('/api/garages/garage-a', 'valid-worker-token', {
      headers: { 'x-session-id': sessionId }
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_EXPIRED' });
  });

  it('rejects a fresh PIN session after the entity active-session marker is revoked', async () => {
    const sessionId = 'garage-session-marker-revoked';
    mockDb.seed('garage_sessions/worker-uid', {
      uid: 'worker-uid', role: 'garage', entityId: 'garage-a', garageId: 'garage-a',
      sessionId, isActive: true, lastActive: new Date()
    });
    mockDb.seed('garages/garage-a', { id: 'garage-a', name: 'Garage Alpha' });

    const response = await call('/api/garages/garage-a', 'valid-worker-token', {
      headers: { 'x-session-id': sessionId }
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED' });
  });

  it('resolves a fresh active per-device PIN session', async () => {
    const sessionId = 'garage-device-session-a';
    mockDb.seed('garage_sessions/worker-uid', {
      uid: 'worker-uid', role: 'garage', entityId: 'garage-a',
      sessionId: 'another-session', isActive: true, lastActive: new Date()
    });
    mockDb.seed(`garage_sessions/worker-uid/sessions/${sessionId}`, {
      uid: 'worker-uid', role: 'garage', entityId: 'garage-a', garageId: 'garage-a',
      sessionId, isActive: true, lastActive: new Date()
    });
    mockDb.seed('garages/garage-a', {
      id: 'garage-a', name: 'Garage Alpha', activeSessionIds: [sessionId]
    });

    const response = await call('/api/garages/garage-a', 'valid-worker-token', {
      headers: { 'x-session-id': sessionId }
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

  it('defers the stored summary read when live projection buckets are available', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    mockDb.seed('garages/garage-a/projection_buckets/live', {
      dateId: today,
      entriesToday: 1,
      exitsToday: 0,
      grossRevenue: 25,
      refundTotal: 0,
      netRevenue: 25
    });

    mockDb.resetDocumentCounts();
    const liveResponse = await call('/api/garages/garage-a/dashboard-summary', tokens.garage);
    const liveReadCount = mockDb.documentReadCount;
    expect(liveResponse.status).toBe(200);
    expect(mockDb.records.has('garages/garage-a/dashboard_summary/current')).toBe(false);

    mockDb.records.delete('garages/garage-a/projection_buckets/live');
    mockDb.seed('garages/garage-a/dashboard_summary/current', {
      dateId: today,
      rebuiltAt: new Date().toISOString(),
      activeVehicleCount: 1,
      entriesToday: 1,
      exitsToday: 0,
      grossRevenue: 25,
      refundTotal: 0,
      netRevenue: 25
    });
    mockDb.resetDocumentCounts();
    const fallbackResponse = await call('/api/garages/garage-a/dashboard-summary', tokens.garage);
    const fallbackReadCount = mockDb.documentReadCount;
    expect(fallbackResponse.status).toBe(200);
    expect(fallbackReadCount).toBe(liveReadCount + 1);
  });

  it('serves a fresh stored dashboard summary when live buckets are absent', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    mockDb.seed('garages/garage-a/dashboard_summary/current', {
      dateId: today,
      rebuiltAt: new Date().toISOString(),
      activeVehicleCount: 4,
      entriesToday: 2,
      exitsToday: 1,
      grossRevenue: 80,
      refundTotal: 0,
      netRevenue: 80
    });

    const response = await call('/api/garages/garage-a/dashboard-summary', tokens.garage);

    expect(response.status).toBe(200);
    expect(response.headers.get('x-summary-source')).toBe('stored_rebuild');
    expect(await response.json()).toMatchObject({
      success: true,
      data: { garageId: 'garage-a', summary: { entriesToday: 2, grossRevenue: 80 } }
    });
  });

  it('rejects a stale stored dashboard summary instead of serving outdated metrics', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    mockDb.seed('garages/garage-a/dashboard_summary/current', {
      dateId: today,
      rebuiltAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      grossRevenue: 999999,
      netRevenue: 999999
    });

    const response = await call('/api/garages/garage-a/dashboard-summary', tokens.garage);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: 'DASHBOARD_SUMMARY_STALE' });
  });
});
