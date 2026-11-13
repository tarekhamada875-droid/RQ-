/**
 * Session infrastructure — auth middleware, session index management,
 * and session resolution helpers.
 *
 * Extracted from workerSessionRoutes.ts (Wave 6b). This module owns:
 *   - requireWorkerAuth (the auth middleware used by every protected route)
 *   - Session-index helpers (writeSessionIndex, updateSessionIndex,
 *     resolveWorkerSessionUser)
 *   - Worker session definitions (role → collection mapping)
 *
 * workerSessionRoutes.ts imports requireWorkerAuth and the helpers
 * from here. Other route-registration modules (garageRoutes, vehicleRoutes,
 * etc.) also import requireWorkerAuth from here.
 */
import type { WorkerUser } from './cloudflareWorker';
import { adminDb, adminAuth } from './firebaseAdmin';
import { isValidBackendOperatorToken } from './backendOperatorToken';
import { cleanPin, normalizePhone, verifyPinMatch, verifyDocMatch } from './pinCrypto';
import { migratePinToHash, queryAccountWherePin, queryDelegatesWherePhone, getAdminPin, checkPinAvailabilityAcrossAll, saveEntityPin } from './pinRepository';
import { isNewPinFormat, validateNewPin, isValidSessionId } from './validation';
import { addActiveSession, hasActiveSession, hashSessionId, removeActiveSession, toSessionSummary, activeSessionIds, overflowCandidateIds, isSessionLastActiveStale } from './auth/sessionMarkers';
import { canInvalidateAllSessions } from './domain/authorization';
import { checkWorkerPinRateLimit, resetWorkerPinRateLimit } from './workerPinRateLimiter';
import { getCachedRole, setCachedRole, getCachedSession, setCachedSession } from './authCache';

export interface WorkerAuthMiddleware {
  (c: any, next: () => Promise<void>, options?: { skipRoleResolution?: boolean }): Promise<any | void>;
}

const WORKER_SESSION_DEFINITIONS: Record<string, { sessions: string; entity: string }> = {
  admin: { sessions: 'admin_sessions', entity: 'admin_settings' },
  delegate: { sessions: 'delegate_sessions', entity: 'delegates' },
  garage: { sessions: 'garage_sessions', entity: 'garages' },
  staff: { sessions: 'staff_sessions', entity: 'staff' }
};

function workerSessionDefinition(role: string | undefined) {
  return role ? WORKER_SESSION_DEFINITIONS[role] : undefined;
}

const SESSION_INDEX_COLLECTION = 'session_index';

function sessionIndexPath(uid: string, sessionId: string): string {
  return `${SESSION_INDEX_COLLECTION}/${hashSessionId(`${uid}:${sessionId}`)}`;
}

function writeSessionIndex(transaction: any, sessionData: Record<string, any>): void {
  if (!sessionData.uid || !sessionData.sessionId || !sessionData.role) return;
  const definition = workerSessionDefinition(sessionData.role);
  if (!definition) return;

  transaction.set(adminDb!.doc(sessionIndexPath(sessionData.uid, sessionData.sessionId)), {
    uid: sessionData.uid,
    sessionHash: hashSessionId(sessionData.sessionId),
    role: sessionData.role,
    entityCollection: definition.entity,
    entityId: sessionData.entityId || '',
    garageId: sessionData.garageId || null,
    displayName: sessionData.displayName || null,
    isActive: sessionData.isActive === true,
    lastActive: sessionData.lastActive || new Date(),
    updatedAt: new Date()
  }, { merge: true });
}

function updateSessionIndex(uid: string, sessionId: string, updates: Record<string, any>): Promise<any> {
  if (!adminDb) return Promise.resolve();
  return adminDb.doc(sessionIndexPath(uid, sessionId)).set({ ...updates, updatedAt: new Date() }, { merge: true });
}

/**
 * Compute the entity's activeSessionIds after claiming `sessionId`.
 *
 * The list previously grew without bound and was capped by evicting the
 * insertion-order-oldest entry — which, for a garage whose devices accumulate
 * sessions (browser reinstalls, cleared storage, per-load fallback IDs), is
 * exactly the daily-use device still holding an active session. The owner then
 * sees "logged out from another device" with no other device involved
 * (2026-11-13 incident).
 *
 * Now: when the list would overflow its cap, probe the oldest entries' device
 * docs and prune the ones that are already dead by the app's own 24h idle
 * rule BEFORE evicting anything live. Under the cap (the common case) this
 * costs zero extra Firestore reads.
 */
export async function claimEntityActiveSessionIds(
  transaction: any,
  entityData: Record<string, any>,
  sessionId: string,
  sessionsRoot: string,
  uid: string
): Promise<string[]> {
  const candidates = overflowCandidateIds(entityData, sessionId);
  if (candidates.length === 0 || !sessionsRoot || !uid || !adminDb) {
    return addActiveSession(entityData, sessionId);
  }
  const staleIds: string[] = [];
  for (const candidateId of candidates) {
    try {
      const deviceSnap = await transaction.get(adminDb.doc(`${sessionsRoot}/${uid}/sessions/${candidateId}`));
      const lastActive = deviceSnap.exists ? (deviceSnap.data() || {}).lastActive : undefined;
      if (!deviceSnap.exists || isSessionLastActiveStale(lastActive)) {
        staleIds.push(candidateId);
      }
    } catch (error: any) {
      // Unreadable device docs must never widen the eviction set; treat as live.
      console.error('[Worker Auth] Stale-session probe failed; keeping entry:', error?.message || 'unknown');
    }
  }
  if (staleIds.length === 0) {
    return addActiveSession(entityData, sessionId);
  }
  const surviving = activeSessionIds(entityData).filter((id) => !staleIds.includes(id));
  return addActiveSession({ activeSessionIds: surviving }, sessionId);
}

async function resolveWorkerSessionUser(
  uid: string,
  sessionId: string,
  expectedRole?: string
): Promise<{ user: WorkerUser; error?: never } | { user?: never; error: 'SESSION_REVOKED' | 'SESSION_EXPIRED' }> {
  if (!adminDb || !uid || !sessionId) return { error: 'SESSION_REVOKED' };
  const sessionTimeoutMs = 24 * 60 * 60 * 1000;

  const indexedSessionSnap = await adminDb.doc(sessionIndexPath(uid, sessionId)).get();
  if (indexedSessionSnap.exists) {
    const indexData = indexedSessionSnap.data() || {};
    const indexedRole = typeof indexData.role === 'string' ? indexData.role : '';
    const indexedDefinition = workerSessionDefinition(indexedRole);
    const roleMatches = !expectedRole || expectedRole === indexedRole;
    const indexMatches = indexData.uid === uid
      && indexData.sessionHash === hashSessionId(sessionId)
      && indexData.isActive === true
      && roleMatches
      && indexedDefinition
      && indexData.entityCollection === indexedDefinition.entity
      && typeof indexData.entityId === 'string'
      && indexData.entityId.length > 0;

    if (indexMatches) {
      const indexedDeviceSnap = await adminDb.doc(`${indexedDefinition.sessions}/${uid}/sessions/${sessionId}`).get();
      if (indexedDeviceSnap.exists) {
        const sessionData = indexedDeviceSnap.data() || {};
        const sessionRoleMatches = sessionData.role ? sessionData.role === indexedRole : true;
        if (sessionData.uid === uid && sessionData.isActive === true && sessionData.sessionId === sessionId && sessionRoleMatches) {
          const rawLastActive = sessionData.lastActive || indexData.lastActive;
          const lastActive = rawLastActive?.toDate
            ? rawLastActive.toDate().getTime()
            : new Date(rawLastActive || 0).getTime();
          if (!Number.isFinite(lastActive) || !lastActive || Date.now() - lastActive > sessionTimeoutMs) {
            console.info('[Worker Auth] session resolution', { path: 'indexed', outcome: 'expired', role: indexedRole });
            return { error: 'SESSION_EXPIRED' };
          }

          const entityId = indexedRole === 'admin' ? 'auth_pin' : indexData.entityId;
          const entitySnap = await adminDb.doc(`${indexedDefinition.entity}/${entityId}`).get();
          // Device-doc authority (2026-11-13 incident): the per-device session
          // doc above is the authentication record — it is Worker-written and
          // has no shared-doc contention. The entity doc's activeSessionIds
          // array is advisory bookkeeping maintained by the same
          // claim/release transactions, but several of its writers are
          // non-transactional read-modify-writes, so a lost update there must
          // never log out a live device. Only the entity's EXISTENCE is
          // required here (deleted/disabled account). Real revocation
          // deactivates the device doc itself (release-session,
          // DELETE /api/auth/sessions/:key, invalidate-all-sessions), which is
          // what the isActive check above already enforces.
          if (entitySnap.exists) {
            const entityData = entitySnap.data() || {};
            let garageId = sessionData.garageId || indexData.garageId || (indexedRole === 'garage' ? entityId : null);
            let displayName = sessionData.displayName || indexData.displayName || '';
            if (indexedRole === 'staff') {
              garageId = garageId || entityData.garageId || null;
              displayName = displayName || entityData.name || '';
            }
            console.info('[Worker Auth] session resolution', { path: 'indexed', outcome: 'hit', role: indexedRole });
            return {
              user: {
                uid,
                role: indexedRole,
                garageId,
                entityId,
                displayName: displayName || undefined
              }
            };
          }
        }
      }
    }
  }

  console.info('[Worker Auth] session resolution', { path: 'legacy', outcome: 'fallback', expectedRole: expectedRole || 'any' });

  const roleEntries: Array<[string, { sessions: string; entity: string }]> = expectedRole && workerSessionDefinition(expectedRole)
    ? [[expectedRole, WORKER_SESSION_DEFINITIONS[expectedRole]]]
    : Object.entries(WORKER_SESSION_DEFINITIONS);

  for (const [role, definition] of roleEntries) {
    const rootRef = adminDb.doc(`${definition.sessions}/${uid}`);
    const deviceRef = adminDb.doc(`${definition.sessions}/${uid}/sessions/${sessionId}`);
    const [rootSnap, deviceSnap] = await Promise.all([rootRef.get(), deviceRef.get()]);
    const sessionSnap = deviceSnap.exists ? deviceSnap : rootSnap;
    if (!sessionSnap.exists) continue;

    const sessionData = sessionSnap.data() || {};
    if (sessionData.uid !== uid || sessionData.isActive !== true || sessionData.sessionId !== sessionId || (sessionData.role && sessionData.role !== role)) continue;

    const rawLastActive = sessionData.lastActive;
    const lastActive = rawLastActive?.toDate
      ? rawLastActive.toDate().getTime()
      : new Date(rawLastActive || 0).getTime();
    if (!Number.isFinite(lastActive) || !lastActive || Date.now() - lastActive > sessionTimeoutMs) {
      return { error: 'SESSION_EXPIRED' };
    }

    const entityId = role === 'admin' ? 'auth_pin' : sessionData.entityId || '';
    if (!entityId) continue;
    // Device-doc authority (see the indexed path above): the entity marker is
    // advisory bookkeeping, not an auth gate. Only existence is required.
    const entitySnap = await adminDb.doc(`${definition.entity}/${entityId}`).get();
    if (!entitySnap.exists) continue;
    const entityData = entitySnap.data() || {};

    let garageId = sessionData.garageId || (role === 'garage' ? entityId : null);
    let displayName = sessionData.displayName || '';
    if (role === 'staff') {
      garageId = garageId || entityData.garageId || null;
      displayName = displayName || entityData.name || '';
    }

    return {
      user: {
        uid,
        role,
        garageId,
        entityId,
        displayName: displayName || undefined
      }
    };
  }

  return { error: 'SESSION_REVOKED' };
}

// Helper: Worker Authentication Middleware
export const requireWorkerAuth: WorkerAuthMiddleware = async function requireWorkerAuth(
  c: any,
  next: () => Promise<void>,
  options: { skipRoleResolution?: boolean } = {}
) {
  // Check diagnostic / operator token first
  const operatorToken = c.req.header('x-backend-operator-token');
  const configuredToken = c.env?.BACKEND_OPERATOR_TOKEN || process.env.BACKEND_OPERATOR_TOKEN;
  if (operatorToken && isValidBackendOperatorToken(operatorToken, configuredToken)) {
    const method = c.req.method.toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      return c.json({
        success: false,
        error: 'FORBIDDEN: Mutating operations via backend operator token are prohibited. Use authentic role-specific credentials instead.'
      }, 403);
    }

    c.set('user', {
      uid: 'backend-operator',
      role: 'viewer',
      entityId: 'backend-operator',
      displayName: 'Backend Operator'
    });
    return next();
  }

  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return c.json({ success: false, error: 'UNAUTHORIZED: Bearer token required' }, 401);
  }

  if (!adminAuth) {
    return c.json({ success: false, error: 'ADMIN_AUTH_NOT_INITIALIZED' }, 503);
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const decodedUid = (decoded as any).uid || (decoded as any).user_id || (decoded as any).sub || '';
    let role = (decoded as any).role || 'worker';
    let garageId = (decoded as any).garageId || null;
    const entityId = (decoded as any).entityId || decodedUid;
    // PR-F: token iat (issued-at, Unix seconds) is the cache invalidation
    // boundary. Token rotation (hourly) produces a new iat → new cache key,
    // so we never serve stale role info from a previous token. Firebase ID
    // tokens always carry iat as a number; the fallback `0` only kicks in
    // for synthetic test tokens that skip verification.
    const iat = typeof (decoded as any).iat === 'number' ? (decoded as any).iat : 0;

    if (!options.skipRoleResolution && adminDb && (!role || role === 'worker')) {
      // PR-F: check the role cache before doing up to 3 Firestore reads.
      // Cache hit → 0 Firestore reads for role resolution.
      const cached = getCachedRole({ uid: decodedUid, iat });
      if (cached) {
        role = cached.role;
        garageId = cached.garageId;
        // entityId from cache; falls back to decodedUid for admin (auth_pin case).
        // We don't overwrite entityId here because the cache stores it correctly.
      } else {
        const adminDoc = await adminDb.doc(`admins/${decodedUid}`).get();
        if (adminDoc.exists) {
          role = 'admin';
        } else {
          const staffDoc = await adminDb.doc(`staff/${decodedUid}`).get();
          if (staffDoc.exists) {
            role = staffDoc.data()?.role || 'worker';
            garageId = staffDoc.data()?.garageId || null;
          } else {
            const garageDoc = await adminDb.doc(`garages/${decodedUid}`).get();
            if (garageDoc.exists) {
              role = 'garage';
              garageId = decodedUid;
            }
          }
        }
        // PR-F: populate the cache. entityId from the decoded token is the
        // authoritative value (admin → auth_pin mapping is handled in
        // resolveWorkerSessionUser, not here).
        setCachedRole({ uid: decodedUid, iat }, { role, garageId, entityId });
      }
    }

    const sessionId = (c.req.header('x-session-id') || '').trim();
    const requiresActiveSession = Boolean(workerSessionDefinition(role));
    if (!options.skipRoleResolution && (requiresActiveSession || role === 'worker') && !sessionId) {
      return c.json({ success: false, error: 'SESSION_REVOKED' }, 401);
    }
    if (!options.skipRoleResolution && sessionId) {
      if (!adminDb) return c.json({ success: false, error: 'SESSION_VALIDATION_UNAVAILABLE' }, 503);
      // PR-F: check the session cache before doing up to 3 Firestore reads.
      // Cache hit → 0 Firestore reads for session resolution. The cached
      // WorkerUser is returned directly (no entity-doc re-validation) — this
      // is acceptable because the cache TTL is only 30s, and session
      // revocation is eventually-consistent within that window.
      const cachedSession = getCachedSession({ uid: decodedUid, sessionId, iat });
      if (cachedSession) {
        c.set('user', cachedSession.user);
        return next();
      }
      const resolution = await resolveWorkerSessionUser(decodedUid, sessionId, workerSessionDefinition(role) ? role : undefined);
      if (!resolution.user) {
        return c.json({ success: false, error: resolution.error }, 401);
      }
      // PR-F: populate the session cache. The cached user is the resolved
      // WorkerUser, which includes role/garageId/entityId/displayName.
      setCachedSession({ uid: decodedUid, sessionId, iat }, resolution.user);
      c.set('user', resolution.user);
      return next();
    }

    if (role === 'supervisor') {
      return c.json({ success: false, error: 'ROLE_RETIRED' }, 403);
    }

    c.set('user', {
      uid: decodedUid,
      email: decoded.email,
      role,
      garageId,
      entityId
    });
    return next();
  } catch (err: any) {
    return c.json({ success: false, error: 'INVALID_TOKEN', message: err?.message || 'Token verification failed' }, 401);
  }
};

// Re-export helpers used by the route handlers
export {
  writeSessionIndex,
  updateSessionIndex,
  resolveWorkerSessionUser,
  workerSessionDefinition,
  WORKER_SESSION_DEFINITIONS,
  sessionIndexPath,
};

// Re-export all imports that the route handlers also need
export {
  cleanPin,
  normalizePhone,
  verifyPinMatch,
  verifyDocMatch,
  migratePinToHash,
  queryAccountWherePin,
  queryDelegatesWherePhone,
  getAdminPin,
  checkPinAvailabilityAcrossAll,
  saveEntityPin,
  isValidSessionId,
  isNewPinFormat,
  validateNewPin,
  addActiveSession,
  hasActiveSession,
  hashSessionId,
  removeActiveSession,
  toSessionSummary,
  canInvalidateAllSessions,
  checkWorkerPinRateLimit,
  resetWorkerPinRateLimit,
};
