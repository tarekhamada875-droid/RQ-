/**
 * Device-doc authority — regression tests for the 2026-11-13 incident.
 *
 * Incident: the owner was repeatedly force-logged-out with
 * 'تم تسجيل خروجك من جهاز آخر' (SESSION_REVOKED) while using the app,
 * with no other device involved. Their device's session doc
 * (garage_sessions/{uid}/sessions/{sid}) was active and fresh — the device
 * had done nothing wrong — but the entity doc's shared activeSessionIds
 * array had lost the entry. Several writers update that shared array
 * non-transactionally (release / revoke / validate-revocation paths, the
 * invalidate-all batch, the PIN-change reset), and the pre-#737 cap evicted
 * insertion-order-oldest entries. Because EVERY authenticated API call
 * required hasActiveSession(entityDoc) to pass, any single lost update on
 * that cosmetic array hardened into a full logout, and
 * /api/auth/validate-or-refresh-session then PERMANENTLY deactivated the
 * blameless device doc (amplification).
 *
 * Contract pinned here:
 *   1. Auth lives in the device session doc + session_index (both
 *      Worker-written, per-device, no shared-doc contention). The entity
 *      marker is bookkeeping only and MUST NOT gate authentication.
 *   2. A missing/absent entity marker never 401s a device whose session doc
 *      is active and fresh, and never deactivates that device doc.
 *   3. Real revocation still wins: a deactivated device doc, a deleted
 *      entity, or an idle-expired session all still 401.
 */
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
  initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));

import { api } from '../../server/api';
import { __resetAllAuthCachesForTests } from '../../server/authCache';

const GARAGE_UID = 'garage-uid-garage-a';
const GARAGE_ID = 'garage-a';
const SESSION_A = 'device-a';

function seedLiveDeviceWithoutEntityMarker(): void {
  const now = new Date();
  mockDb.seed('garages/garage-a', {
    id: GARAGE_ID,
    name: 'Garage Alpha',
    // The incident state: another device's session is marked, this device's
    // entry was lost by one of the shared-array writers. No activeSessionIds
    // entry and no currentSessionId pointing at device-a.
    activeSessionIds: ['some-other-device'],
    currentSessionId: 'some-other-device'
  });
  mockDb.seed(`garage_sessions/${GARAGE_UID}`, {
    uid: GARAGE_UID,
    role: 'garage',
    entityId: GARAGE_ID,
    sessionId: SESSION_A,
    isActive: true,
    activeSessionIds: [SESSION_A],
    lastActive: now
  });
  mockDb.seed(`garage_sessions/${GARAGE_UID}/sessions/${SESSION_A}`, {
    uid: GARAGE_UID,
    role: 'garage',
    entityId: GARAGE_ID,
    garageId: GARAGE_ID,
    sessionId: SESSION_A,
    isActive: true,
    createdAt: now,
    lastActive: now
  });
  mockDb.seed(`session_index/${hashSessionId(`${GARAGE_UID}:${SESSION_A}`)}`, {
    uid: GARAGE_UID,
    sessionHash: hashSessionId(SESSION_A),
    role: 'garage',
    entityCollection: 'garages',
    entityId: GARAGE_ID,
    isActive: true,
    lastActive: now
  });
}

async function garageRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return api.fetch(new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      authorization: 'Bearer valid-garage-token-garage-a',
      'x-session-id': SESSION_A,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  }), {});
}

describe('device-doc session authority (2026-11-13 incident)', () => {
  beforeEach(() => {
    mockDb.clear();
    __resetAllAuthCachesForTests();
  });

  it('authenticates a live device whose entity marker was lost by another writer', async () => {
    seedLiveDeviceWithoutEntityMarker();
    const response = await garageRequest('/api/system-config');
    expect(response.status).toBe(200);
  });

  it('does not deactivate a live device doc during validate-or-refresh when the entity marker is missing', async () => {
    seedLiveDeviceWithoutEntityMarker();
    const response = await garageRequest('/api/auth/validate-or-refresh-session', {
      method: 'POST',
      body: JSON.stringify({ uid: GARAGE_UID, sessionId: SESSION_A, role: 'garage', entityId: GARAGE_ID })
    });
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.valid).toBe(true);
    expect(mockDb.records.get(`garage_sessions/${GARAGE_UID}/sessions/${SESSION_A}`)?.isActive).toBe(true);
  });

  it('still rejects a genuinely revoked (deactivated) device doc', async () => {
    seedLiveDeviceWithoutEntityMarker();
    mockDb.seed(`garage_sessions/${GARAGE_UID}/sessions/${SESSION_A}`, {
      uid: GARAGE_UID,
      role: 'garage',
      entityId: GARAGE_ID,
      garageId: GARAGE_ID,
      sessionId: SESSION_A,
      isActive: false, // admin revoked this device
      createdAt: new Date(),
      lastActive: new Date()
    });
    const response = await garageRequest('/api/system-config');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_REVOKED' });
  });

  it('still rejects the device when the entity was deleted', async () => {
    seedLiveDeviceWithoutEntityMarker();
    mockDb.records.delete('garages/garage-a');
    const response = await garageRequest('/api/system-config');
    expect(response.status).toBe(401);
  });

  it('still reports expiry (not revocation) for an idle-expired device doc', async () => {
    seedLiveDeviceWithoutEntityMarker();
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockDb.seed(`garage_sessions/${GARAGE_UID}/sessions/${SESSION_A}`, {
      uid: GARAGE_UID,
      role: 'garage',
      entityId: GARAGE_ID,
      garageId: GARAGE_ID,
      sessionId: SESSION_A,
      isActive: true,
      createdAt: stale,
      lastActive: stale
    });
    const response = await garageRequest('/api/system-config');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: 'SESSION_EXPIRED' });
  });

  it('signs out live device sessions when the admin changes the entity PIN', async () => {
    // The PIN is the only credential for new logins. The old implicit kick
    // relied on the entity marker gating auth (removed); the kick now happens
    // server-side in /api/people/update-pin via the session_index.
    seedLiveDeviceWithoutEntityMarker();
    mockDb.seed('admin_sessions/admin-uid', {
      uid: 'admin-uid', role: 'admin', entityId: 'auth_pin', sessionId: 'admin-session',
      isActive: true, activeSessionIds: ['admin-session'], lastActive: new Date()
    });
    mockDb.seed('admin_sessions/admin-uid/sessions/admin-session', {
      uid: 'admin-uid', role: 'admin', entityId: 'auth_pin', sessionId: 'admin-session',
      isActive: true, lastActive: new Date()
    });
    mockDb.seed('admin_settings/auth_pin', { activeSessionIds: ['admin-session'], currentSessionId: 'admin-session' });
    mockDb.seed(`session_index/${hashSessionId('admin-uid:admin-session')}`, {
      uid: 'admin-uid', sessionHash: hashSessionId('admin-session'), role: 'admin',
      entityCollection: 'admin_settings', entityId: 'auth_pin', isActive: true, lastActive: new Date()
    });

    const response = await api.fetch(new Request('http://localhost/api/people/update-pin', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-admin-token',
        'x-session-id': 'admin-session',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ entityType: 'garages', entityId: GARAGE_ID, newPin: '55555' })
    }), {});

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true });
    expect(mockDb.records.get(`garage_sessions/${GARAGE_UID}/sessions/${SESSION_A}`)?.isActive).toBe(false);
    expect(mockDb.records.get(`session_index/${hashSessionId(`${GARAGE_UID}:${SESSION_A}`)}`)?.isActive).toBe(false);
    // The admin's own session (different entity) is untouched.
    expect(mockDb.records.get('admin_sessions/admin-uid/sessions/admin-session')?.isActive).toBe(true);
  });
});
