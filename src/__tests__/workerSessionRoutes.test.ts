import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionId } from '../../server/auth/sessionMarkers';
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

const authHeaders = (sessionId = 'session-a') => ({
  authorization: 'Bearer valid-admin-token',
  'x-session-id': sessionId,
  'content-type': 'application/json'
});

async function request(path: string, init: RequestInit = {}, env: Record<string, unknown> = {}) {
  return workerApp.fetch(new Request(`http://localhost${path}`, { ...init, headers: { ...authHeaders(), ...(init.headers || {}) } }), env);
}

describe('Worker session lifecycle routes', () => {
  beforeEach(() => {
    mockDb.clear();
    mockDb.seed('admin_sessions/admin-uid', {
      uid: 'admin-uid',
      role: 'admin',
      entityId: 'auth_pin',
      sessionId: 'session-a',
      currentSessionId: 'session-a',
      activeSessionIds: ['session-a', 'session-b'],
      isActive: true,
      lastActive: new Date()
    });
    mockDb.seed('admin_sessions/admin-uid/sessions/session-a', {
      uid: 'admin-uid', role: 'admin', entityId: 'auth_pin', sessionId: 'session-a', isActive: true, createdAt: new Date(), lastActive: new Date()
    });
    mockDb.seed('admin_sessions/admin-uid/sessions/session-b', {
      uid: 'admin-uid', role: 'admin', entityId: 'auth_pin', sessionId: 'session-b', isActive: true, createdAt: new Date(), lastActive: new Date()
    });
    mockDb.seed('admin_settings/auth_pin', { currentSessionId: 'session-a', activeSessionIds: ['session-a', 'session-b'] });
  });

  it('lists active sessions with hashed IDs only', async () => {
    const response = await request('/api/auth/sessions');
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions.map((session: any) => session.id)).toEqual(expect.arrayContaining([hashSessionId('session-a'), hashSessionId('session-b')]));
    expect(JSON.stringify(body)).not.toContain('session-a');
    expect(JSON.stringify(body)).not.toContain('session-b');
  });

  it('revokes one own device and updates root/entity markers', async () => {
    const sessionKey = hashSessionId('session-b');
    const response = await request(`/api/auth/sessions/${sessionKey}`, { method: 'DELETE' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, revokedSession: sessionKey, wasCurrent: false });
    expect(mockDb.records.get('admin_sessions/admin-uid/sessions/session-b')?.isActive).toBe(false);
    expect(mockDb.records.get('admin_sessions/admin-uid')?.activeSessionIds).toEqual(['session-a']);
    expect(mockDb.records.get('admin_settings/auth_pin')?.activeSessionIds).toEqual(['session-a']);
  });

  it('releases the caller session and denies a stale session afterward', async () => {
    const response = await request('/api/auth/release-session', {
      method: 'POST',
      body: JSON.stringify({ uid: 'admin-uid', sessionId: 'session-a', role: 'admin', entityId: 'auth_pin' })
    });
    expect(response.status).toBe(200);
    expect(mockDb.records.get('admin_sessions/admin-uid/sessions/session-a')?.isActive).toBe(false);

    const stale = await request('/api/auth/sessions', { headers: authHeaders('session-a') });
    expect(stale.status).toBe(401);
  });

  it('rejects releasing another user session for a non-admin token', async () => {
    const response = await workerApp.fetch(new Request('http://localhost/api/auth/release-session', {
      method: 'POST',
      headers: { authorization: 'Bearer valid-garage-token-garage-a', 'content-type': 'application/json' },
      body: JSON.stringify({ uid: 'another-user', sessionId: 'session-a', role: 'garage', entityId: 'garage-a' })
    }));
    expect(response.status).toBe(403);
  });
});
