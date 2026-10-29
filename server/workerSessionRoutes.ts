import type { WorkerApp, WorkerUser } from './cloudflareWorker';
import { adminDb, adminAuth } from './firebaseAdmin';
import { isValidBackendOperatorToken } from './backendOperatorToken';
import { cleanPin, verifyPinMatch, verifyDocMatch, migratePinToHash, queryAccountWherePin, queryDelegatesWherePhone, getAdminPin, checkPinAvailabilityAcrossAll, saveEntityPin } from './utils';
import { isNewPinFormat, validateNewPin } from './validation';
import { addActiveSession, hasActiveSession, hashSessionId, removeActiveSession, toSessionSummary } from './auth/sessionMarkers';
import { canInvalidateAllSessions } from './domain/authorization';
import { checkWorkerPinRateLimit, resetWorkerPinRateLimit } from './workerPinRateLimiter';

/**
 * Session, PIN-auth, and session-management routes for the Worker.
 *
 * Extracted from cloudflareWorker.ts. This module owns:
 *   - requireWorkerAuth (the auth middleware used by every protected route)
 *   - The session-index helpers (writeSessionIndex, updateSessionIndex,
 *     resolveWorkerSessionUser)
 *   - The 10 /api/auth/* routes: verify-pin, verify-admin-pin,
 *     check-pin-availability, update-pin, claim-admin-session,
 *     validate-or-refresh-session, release-session,
 *     release-admin-session, invalidate-all-sessions, sessions list/delete
 *
 * requireWorkerAuth is exported so that other route-registration modules
 * (garageRoutes, vehicleRoutes, etc.) can receive it as a dependency.
 */

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
          if (entitySnap.exists && hasActiveSession(entitySnap.data() || {}, sessionId)) {
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
    const entitySnap = await adminDb.doc(`${definition.entity}/${entityId}`).get();
    if (!entitySnap.exists || !hasActiveSession(entitySnap.data() || {}, sessionId)) continue;
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
    // Restrict the operator token: it is strictly for diagnostics (GET, HEAD, OPTIONS).
    // Mutating requests (POST, PUT, DELETE, PATCH) are completely blocked in ALL environments.
    const method = c.req.method.toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      return c.json({
        success: false,
        error: 'FORBIDDEN: Mutating operations via backend operator token are prohibited. Use authentic role-specific credentials instead.'
      }, 403);
    }

    c.set('user', {
      uid: 'backend-operator',
      role: 'viewer', // ALWAYS 'viewer' role to prevent administrative or financial mutations
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

    if (!options.skipRoleResolution && adminDb && (!role || role === 'worker')) {
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
    }

    // Application roles are never authorized from Firebase claims alone.
    // PIN login creates a server-owned session; require it on every protected
    // request so revocation, expiry, and entity scope remain enforceable.
    const sessionId = (c.req.header('x-session-id') || '').trim();
    const requiresActiveSession = Boolean(workerSessionDefinition(role));
    if (!options.skipRoleResolution && (requiresActiveSession || role === 'worker') && !sessionId) {
      return c.json({ success: false, error: 'SESSION_REVOKED' }, 401);
    }
    if (!options.skipRoleResolution && sessionId) {
      if (!adminDb) return c.json({ success: false, error: 'SESSION_VALIDATION_UNAVAILABLE' }, 503);
      const resolution = await resolveWorkerSessionUser(decodedUid, sessionId, workerSessionDefinition(role) ? role : undefined);
      if (!resolution.user) {
        return c.json({ success: false, error: resolution.error }, 401);
      }
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

export function registerSessionRoutes(workerApp: WorkerApp): void {
  // Authentication routes are Fetch-native and owned by the Cloudflare Worker.
  // Keep the server-owned PIN lookup, validation, and atomic session claim here.
workerApp.post('/api/auth/verify-pin', async (c) => {
  const routeStartedAt = Date.now();
  const authStartedAt = Date.now();
  // PIN login is establishing the role session, so resolving a prior role session
  // here would add serial Firestore reads without contributing to authentication.
  const authResult = await requireWorkerAuth(c, async () => undefined, { skipRoleResolution: true });
  if (authResult instanceof Response) return authResult;
  const authMs = Date.now() - authStartedAt;

  try {
    const credentials = await c.req.json().catch(() => ({} as Record<string, any>));
    const currentUser = c.get('user');
    const effectiveUid = currentUser?.uid || '';
    const suppliedUid = typeof credentials.uid === 'string' ? credentials.uid.trim() : '';
    if (!effectiveUid) return c.json({ success: false, error: 'UNAUTHORIZED' }, 401);
    if (suppliedUid && suppliedUid !== effectiveUid) return c.json({ success: false, error: 'UID_MISMATCH' }, 401);

    const sessionId = typeof credentials.sessionId === 'string' ? credentials.sessionId.trim() : '';
    if (!sessionId) return c.json({ success: false, error: 'SESSION_ID_REQUIRED' }, 400);

    const expectedRole = credentials.expectedRole;
    if (expectedRole !== undefined && expectedRole !== 'delegate') {
      return c.json({ success: false, error: 'INVALID_ROLE_SCOPE' }, 400);
    }

    const rawInput = credentials.pin || credentials.input;
    const normalizedPin = cleanPin(rawInput);
    if (!normalizedPin || !isNewPinFormat(normalizedPin)) return c.json({ success: false, error: 'بيانات الدخول غير صحيحة' });

    const clientIp = c.req.header('cf-connecting-ip') || 'unknown';
    const rateLimitStartedAt = Date.now();
    let pinLimit: Awaited<ReturnType<typeof checkWorkerPinRateLimit>>;
    try {
      pinLimit = await checkWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, effectiveUid, clientIp);
    } catch (error: any) {
      console.error('[Worker Auth] PIN rate limiter unavailable:', error?.message || 'unknown');
      return c.json({ success: false, error: 'RATE_LIMITER_UNAVAILABLE' }, 503);
    }
    const rateLimitMs = Date.now() - rateLimitStartedAt;
    if (pinLimit.allowed === false) {
      return c.json({ success: false, error: 'RATE_LIMIT_EXCEEDED', resetAt: pinLimit.resetAt }, 429);
    }

    // Preserve the legacy Delegate phone-plus-PIN migration path. When a phone
    // is supplied, scope the lookup to that delegate instead of falling back to
    // a global PIN search.
    const normalizedPhone = cleanPin(credentials.phone);
    if (normalizedPhone) {
      const delegateDocs = await queryDelegatesWherePhone(normalizedPhone);
      const delegateMatches = delegateDocs
        .map((doc) => ({ ...doc, check: verifyDocMatch(normalizedPin, doc.data) }))
        .filter((doc) => doc.check.matches);
      if (delegateMatches.length !== 1) return c.json({ success: false, error: 'بيانات الدخول غير صحيحة' });

      const delegate = delegateMatches[0];
      const account = { ...delegate.data };
      delete account.pin;
      delete account.ownerPin;
      delete account.adminPin;
      delete account.pinLookupHash;
      if (delegate.check.isLegacy) await migratePinToHash('delegates', delegate.id, normalizedPin);
      if (!adminDb) return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);

      await adminDb.runTransaction(async (transaction: any) => {
        const entityRef = adminDb.doc(`delegates/${delegate.id}`);
        const securityRef = adminDb.doc(`delegate_sessions/${effectiveUid}`);
        const deviceSecurityRef = adminDb.doc(`delegate_sessions/${effectiveUid}/sessions/${sessionId}`);
        const entitySnap = await transaction.get(entityRef);
        const entityData = entitySnap.exists ? entitySnap.data() || {} : {};
        const now = new Date();
        const sessionData = { uid: effectiveUid, role: 'delegate', entityId: delegate.id, sessionId, isActive: true, lastActive: now, createdAt: now };
        transaction.set(entityRef, { currentSessionId: sessionId, activeSessionIds: addActiveSession(entityData, sessionId), lastActive: now }, { merge: true });
        transaction.set(securityRef, sessionData, { merge: true });
        transaction.set(deviceSecurityRef, sessionData, { merge: true });
        writeSessionIndex(transaction, sessionData);
      });
      await resetWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, effectiveUid, clientIp);
      return c.json({ success: true, role: 'delegate', accountId: delegate.id, account: { id: delegate.id, ...account }, sessionClaimed: true });
    }

    const collectionsToCheck: Array<{ name: string; role: 'supervisor' | 'delegate' | 'staff' | 'garage' }> = [
      { name: 'garages', role: 'garage' },
      { name: 'staff', role: 'staff' },
      { name: 'delegates', role: 'delegate' },
      { name: 'supervisors', role: 'supervisor' }
    ];
    const pinLookupStartedAt = Date.now();
    const [adminPinStored, ...collectionResults] = await Promise.all([
      getAdminPin(),
      ...collectionsToCheck.map((collection) => queryAccountWherePin(collection.name, normalizedPin))
    ]);
    const pinLookupMs = Date.now() - pinLookupStartedAt;

    const matchResolutionStartedAt = Date.now();
    const matches: Array<{ role: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage'; id: string; account?: any; isLegacyMatch?: boolean }> = [];
    const adminCheck = verifyPinMatch(normalizedPin, adminPinStored);
    if (adminCheck.matches) {
      matches.push({ role: 'admin', id: 'admin', isLegacyMatch: adminCheck.isLegacy });
      if (adminCheck.isLegacy && !expectedRole) await migratePinToHash('admin_settings', 'auth_pin', normalizedPin);
    }

    for (let index = 0; index < collectionsToCheck.length; index += 1) {
      const collection = collectionsToCheck[index];
      for (const docSnap of collectionResults[index] || []) {
        const account = { ...(docSnap as any).data };
        delete account.pin;
        delete account.ownerPin;
        delete account.adminPin;
        delete account.pinLookupHash;
        matches.push({ role: collection.role, id: docSnap.id, account: { id: docSnap.id, ...account }, isLegacyMatch: docSnap.isLegacyMatch });
        if (docSnap.isLegacyMatch && !expectedRole && collection.role !== 'supervisor') {
          await migratePinToHash(collection.name, docSnap.id, normalizedPin);
        }
      }
    }
    const matchResolutionMs = Date.now() - matchResolutionStartedAt;

    if (matches.length > 1) return c.json({ success: false, error: 'PIN_NOT_UNIQUE' });
    if (matches.length === 0) return c.json({ success: false, error: 'بيانات الدخول غير صحيحة' });

    const match = matches[0];
    // Keep legacy Supervisor PINs reserved during retirement, but never issue a session.
    if (match.role === 'supervisor') return c.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    if (expectedRole && match.role !== expectedRole) {
      return c.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    }
    if (expectedRole === 'delegate' && match.isLegacyMatch) {
      await migratePinToHash('delegates', match.id, normalizedPin);
    }

    const sessionDef = workerSessionDefinition(match.role);
    const entityColl = sessionDef?.entity || '';
    const secColl = sessionDef?.sessions || '';
    const entityDocId = match.role === 'admin' ? 'auth_pin' : match.id;
    if (!adminDb || !entityColl || !secColl) return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);

    const sessionClaimStartedAt = Date.now();
    await adminDb.runTransaction(async (transaction: any) => {
      const entityRef = adminDb.doc(`${entityColl}/${entityDocId}`);
      const securityRef = adminDb.doc(`${secColl}/${effectiveUid}`);
      const deviceSecurityRef = adminDb.doc(`${secColl}/${effectiveUid}/sessions/${sessionId}`);
      const entitySnap = await transaction.get(entityRef);
      const entityData = entitySnap.exists ? entitySnap.data() || {} : {};
      const activeSessionIds = addActiveSession(entityData, sessionId);
      const resolvedGarageId = match.role === 'staff' ? (entityData.garageId || '') : (match.role === 'garage' ? entityDocId : '');
      const displayName = match.account?.name || (match.role === 'admin' ? 'مدير النظام' : (match.role === 'garage' ? 'مدير الجراج' : match.role));
      const sessionData = { uid: effectiveUid, role: match.role, entityId: entityDocId, garageId: resolvedGarageId, displayName, sessionId, isActive: true, lastActive: new Date(), createdAt: new Date() };
      transaction.set(entityRef, { currentSessionId: sessionId, activeSessionIds, lastActive: new Date() }, { merge: true });
      transaction.set(securityRef, sessionData, { merge: true });
      transaction.set(deviceSecurityRef, sessionData, { merge: true });
      writeSessionIndex(transaction, sessionData);
    });
    const sessionClaimMs = Date.now() - sessionClaimStartedAt;

    const rawCorrelationId = String(c.get('correlationId') || '');
    const correlationId = /^[A-Za-z0-9._:-]{1,128}$/.test(rawCorrelationId) ? rawCorrelationId : 'invalid';
    const limiterResetStartedAt = Date.now();
    const limiterResetPromise = resetWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, effectiveUid, clientIp)
      .then(() => {
        console.info('[Worker Auth] verify-pin limiter reset complete', {
          correlationId,
          durationMs: Date.now() - limiterResetStartedAt
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '';
        const errorCode = /^PIN_RATE_LIMITER_[A-Z0-9_]+$/.test(message) ? message : 'UNKNOWN';
        console.error('[Worker Auth] PIN rate limiter reset failed after successful claim:', { correlationId, errorCode });
      });
    let executionContext: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
    try {
      executionContext = c.executionCtx as unknown as { waitUntil?: (promise: Promise<unknown>) => void };
    } catch {
      executionContext = undefined;
    }
    let resetDeferred = false;
    if (typeof executionContext?.waitUntil === 'function') {
      try {
        executionContext.waitUntil(limiterResetPromise);
        resetDeferred = true;
      } catch {
        await limiterResetPromise;
      }
    } else {
      await limiterResetPromise;
    }

    console.info('[Worker Auth] verify-pin timing', {
      correlationId,
      outcome: 'success',
      role: match.role,
      authMs,
      rateLimitMs,
      pinLookupMs,
      matchResolutionMs,
      sessionClaimMs,
      totalMs: Date.now() - routeStartedAt,
      resetDeferred
    });

    return c.json({ success: true, role: match.role, accountId: match.id, account: match.account, sessionClaimed: true });
  } catch (error: any) {
    console.error('[Worker Auth] Unexpected error in verify-pin:', error);
    return c.json({ success: false, error: 'حدث خطأ في الاتصال بالخادم', message: error?.message || 'unknown' }, 500);
  }
});

workerApp.post('/api/auth/verify-admin-pin', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const normalizedPin = cleanPin(body.pin);
    if (!normalizedPin) return c.json({ valid: false });
    const clientIp = c.req.header('cf-connecting-ip') || 'unknown';
    const limit = await checkWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, c.get('user')?.uid || '', clientIp);
    if (limit.allowed === false) return c.json({ valid: false, error: 'RATE_LIMIT_EXCEEDED', resetAt: limit.resetAt }, 429);
    const check = verifyPinMatch(normalizedPin, await getAdminPin());
    if (check.matches) await resetWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, c.get('user')?.uid || '', clientIp);
    return c.json({ valid: check.matches });
  } catch (error: any) {
    console.error('[Worker Auth] Error verifying admin PIN:', error?.message || 'unknown');
    return c.json({ valid: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/auth/check-pin-availability', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const clientIp = c.req.header('cf-connecting-ip') || 'unknown';
    const limit = await checkWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, c.get('user')?.uid || '', clientIp);
    if (limit.allowed === false) return c.json({ taken: false, error: 'RATE_LIMIT_EXCEEDED', resetAt: limit.resetAt }, 429);
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const normalizedPin = cleanPin(body.pin);
    if (!normalizedPin) return c.json({ taken: false });
    const result = await checkPinAvailabilityAcrossAll(normalizedPin, typeof body.excludeId === 'string' ? body.excludeId : undefined);
    return c.json({ taken: Boolean(result.taken) });
  } catch (error: any) {
    console.error('[Worker Auth] Error checking PIN availability:', error?.message || 'unknown');
    return c.json({ taken: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/admin/update-pin', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    if (c.get('user')?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const normalizedNewPin = validateNewPin(body.newPin, 'newPin');
    const normalizedCurrentPin = cleanPin(body.currentPin);
    if (!normalizedCurrentPin) return c.json({ success: false, error: 'CURRENT_PIN_REQUIRED' }, 400);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const storedPin = await getAdminPin();
    if (!storedPin) return c.json({ success: false, error: 'ADMIN_PIN_NOT_CONFIGURED' }, 500);
    if (!verifyPinMatch(normalizedCurrentPin, storedPin).matches) return c.json({ success: false, error: 'CURRENT_PIN_INCORRECT' }, 400);
    const pinCheck = await checkPinAvailabilityAcrossAll(normalizedNewPin, 'auth_pin');
    if (pinCheck.taken) return c.json({ success: false, error: 'PIN_ALREADY_TAKEN', takenBy: { name: pinCheck.name || '', role: pinCheck.role } }, 400);
    await saveEntityPin('admin_settings', 'auth_pin', normalizedNewPin);
    await adminDb.doc('admin_settings/auth_pin').set({ pin: null, pinLookupHash: null, updatedAt: new Date() }, { merge: true });
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Worker Admin] Error updating PIN:', error?.message || 'unknown');
    return c.json({ success: false, error: error?.message || 'SERVER_ERROR' }, 400);
  }
});

workerApp.post('/api/auth/claim-admin-session', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const effectiveUid = c.get('user')?.uid || '';
    const uid = typeof body.uid === 'string' ? body.uid.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!effectiveUid || !uid || !sessionId) return c.json({ success: false, error: 'INVALID_PARAMS' }, 400);
    if (uid !== effectiveUid) return c.json({ success: false, error: 'UID_MISMATCH' }, 401);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 503);
    const existing = await adminDb.doc(`admin_sessions/${effectiveUid}`).get();
    const existingData = existing.exists ? existing.data() || {} : {};
    const pinCheck = body.pin ? verifyPinMatch(cleanPin(body.pin), await getAdminPin()) : { matches: false };
    if (!pinCheck.matches && !(existingData.isActive === true && existingData.sessionId === sessionId)) return c.json({ success: false, error: 'INVALID_ADMIN_PIN' }, 403);
    await adminDb.runTransaction(async (transaction: any) => {
      const entityRef = adminDb.doc('admin_settings/auth_pin');
      const rootRef = adminDb.doc(`admin_sessions/${effectiveUid}`);
      const deviceRef = adminDb.doc(`admin_sessions/${effectiveUid}/sessions/${sessionId}`);
      const entitySnap = await transaction.get(entityRef);
      const entityData = entitySnap.exists ? entitySnap.data() || {} : {};
      const activeSessionIds = addActiveSession(entityData, sessionId);
      const sessionData = { uid: effectiveUid, role: 'admin', entityId: 'auth_pin', sessionId, isActive: true, lastActive: new Date(), createdAt: new Date() };
      transaction.set(entityRef, { currentSessionId: sessionId, activeSessionIds, lastActive: new Date() }, { merge: true });
      transaction.set(rootRef, { ...sessionData, currentSessionId: sessionId, activeSessionIds }, { merge: true });
      transaction.set(deviceRef, sessionData, { merge: true });
      writeSessionIndex(transaction, sessionData);
    });
    return c.json({ success: true, sessionClaimed: true });
  } catch (error: any) {
    console.error('[Worker Auth] Error claiming admin session:', error?.message || 'unknown');
    return c.json({ success: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/auth/validate-or-refresh-session', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined, { skipRoleResolution: true });
  if (authResult instanceof Response) return authResult;
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { uid, sessionId, role, entityId } = body;
    const effectiveUid = c.get('user')?.uid || '';
    if (!uid || !sessionId || !role) return c.json({ success: false, valid: false, error: 'INVALID_PARAMS' }, 400);
    if (!effectiveUid) return c.json({ success: false, valid: false, error: 'UNAUTHORIZED' }, 401);
    if (String(uid).trim() !== effectiveUid) return c.json({ success: false, valid: false, error: 'UID_MISMATCH' }, 401);
    if (!adminDb) return c.json({ success: false, valid: false, error: 'DATABASE_UNAVAILABLE' }, 503);

    if (role === 'supervisor') return c.json({ success: false, valid: false, error: 'ROLE_RETIRED' }, 403);
    const sessionDef = workerSessionDefinition(role);
    const secColl = sessionDef?.sessions || '';
    const entityColl = sessionDef?.entity || '';
    if (!secColl || !entityColl) return c.json({ success: false, valid: false, error: 'INVALID_ROLE' });

    const rootRef = adminDb.doc(`${secColl}/${effectiveUid}`);
    const deviceRef = adminDb.doc(`${secColl}/${effectiveUid}/sessions/${sessionId}`);
    const rootSnap = await rootRef.get();
    const deviceSnap = await deviceRef.get();
    const sessionSnap = deviceSnap.exists ? deviceSnap : rootSnap;
    if (!sessionSnap.exists) return c.json({ success: false, valid: false, error: 'SESSION_NOT_FOUND' });
    const sessionData = sessionSnap.data() || {};
    if (!sessionData.isActive || sessionData.sessionId !== sessionId) return c.json({ success: false, valid: false, error: 'SESSION_INVALID' });
    if (sessionData.role && sessionData.role !== role) return c.json({ success: false, valid: false, error: 'INVALID_ROLE' });

    const lastActiveValue = sessionData.lastActive;
    const lastActive = lastActiveValue?.toDate ? lastActiveValue.toDate().getTime() : new Date(lastActiveValue || 0).getTime();
    if (!lastActive || Date.now() - lastActive > 24 * 60 * 60 * 1000) {
      await rootRef.set({ isActive: false }, { merge: true });
      return c.json({ success: false, valid: false, error: 'SESSION_EXPIRED' });
    }

    // The entity-doc hasActiveSession check is needed here to detect multi-device
    // eviction: when device B claims the session, device A's sessionId is removed
    // from the entity's activeSessionIds, but the device-session doc is not updated.
    // Without this read, an evicted device would keep seeing a live dashboard until
    // its 24h session timeout.
    const targetEntityId = role === 'admin' ? 'auth_pin' : sessionData.entityId || entityId;
    if (targetEntityId) {
      const entityRef = adminDb.doc(`${entityColl}/${targetEntityId}`);
      const entitySnap = await entityRef.get();
      if (!entitySnap.exists || !hasActiveSession(entitySnap.data() || {}, sessionId)) {
        await deviceRef.set({ isActive: false }, { merge: true });
        const rootData = rootSnap.exists ? rootSnap.data() || {} : {};
        const remaining = removeActiveSession(rootData, sessionId);
        await rootRef.set({
          activeSessionIds: remaining,
          ...(rootData.sessionId === sessionId ? { sessionId: remaining.at(-1) ?? null, isActive: remaining.length > 0 } : {})
        }, { merge: true });
        await updateSessionIndex(effectiveUid, sessionId, { isActive: false });
        return c.json({ success: false, valid: false, error: 'SESSION_REVOKED' });
      }
      // Skip the entity.lastActive write — it's audit-only and adds 1 write per
      // heartbeat. The deviceRef.lastActive + session_index.lastActive are sufficient
      // for the session freshness check.
    }
    const now = new Date();
    await deviceRef.set({ lastActive: now, isActive: true }, { merge: true });
    await updateSessionIndex(effectiveUid, sessionId, { isActive: true, lastActive: now });
    return c.json({ success: true, valid: true });
  } catch (error: any) {
    console.error('[Worker Auth] Error validating session:', error);
    return c.json({ success: false, valid: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/auth/release-session', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const verifiedUid = c.get('user')?.uid || '';
    const targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const role = typeof body.role === 'string' ? body.role.trim() : '';
    const entityId = typeof body.entityId === 'string' ? body.entityId.trim() : '';
    if (!verifiedUid || !targetUid || !sessionId || !role) return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    if (role === 'supervisor') return c.json({ success: false, error: 'ROLE_RETIRED' }, 410);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 503);

    let authorized = verifiedUid === targetUid;
    if (!authorized) {
      const adminSnap = await adminDb.doc(`admin_sessions/${verifiedUid}`).get();
      authorized = Boolean(adminSnap.exists && adminSnap.data()?.isActive);
    }
    if (!authorized) return c.json({ success: false, error: 'FORBIDDEN: Unauthorized session release' }, 403);

    const definition = workerSessionDefinition(role);
    const targetEntityId = role === 'admin' ? 'auth_pin' : entityId;
    if (!definition) return c.json({ success: false, error: 'INVALID_ROLE' }, 400);

    if (targetEntityId) {
      const entityRef = adminDb.doc(`${definition.entity}/${targetEntityId}`);
      const entitySnap = await entityRef.get();
      if (entitySnap.exists) {
        const data = entitySnap.data() || {};
        const remaining = removeActiveSession(data, sessionId);
        await entityRef.set({
          activeSessionIds: remaining,
          ...(data.currentSessionId === sessionId ? { currentSessionId: remaining.at(-1) ?? null } : {})
        }, { merge: true });
      }
    }

    const rootRef = adminDb.doc(`${definition.sessions}/${targetUid}`);
    const rootSnap = await rootRef.get();
    if (rootSnap.exists) {
      const rootData = rootSnap.data() || {};
      const remaining = removeActiveSession(rootData, sessionId);
      const rootWasReleased = rootData.sessionId === sessionId || rootData.currentSessionId === sessionId;
      await rootRef.set({
        activeSessionIds: remaining,
        ...(rootData.currentSessionId === sessionId ? { currentSessionId: remaining.at(-1) ?? null } : {}),
        ...(rootWasReleased ? { sessionId: remaining.at(-1) ?? null, isActive: remaining.length > 0, lastActive: new Date() } : {})
      }, { merge: true });
    }
    await adminDb.doc(`${definition.sessions}/${targetUid}/sessions/${sessionId}`).set({ isActive: false, lastActive: new Date() }, { merge: true });
    await updateSessionIndex(targetUid, sessionId, { isActive: false });
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Worker Auth] Error releasing session:', error);
    return c.json({ success: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/auth/release-admin-session', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const verifiedUid = c.get('user')?.uid || '';
    const targetUid = typeof body.uid === 'string' ? body.uid.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!verifiedUid || !targetUid || !sessionId) return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    if (verifiedUid !== targetUid || c.get('user')?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 503);
    const rootRef = adminDb.doc(`admin_sessions/${targetUid}`);
    const rootSnap = await rootRef.get();
    const rootData = rootSnap.exists ? rootSnap.data() || {} : {};
    const remaining = removeActiveSession(rootData, sessionId);
    await rootRef.set({ activeSessionIds: remaining, sessionId: remaining.at(-1) ?? null, currentSessionId: remaining.at(-1) ?? null, isActive: remaining.length > 0, lastActive: new Date() }, { merge: true });
    const entityRef = adminDb.doc('admin_settings/auth_pin');
    const entitySnap = await entityRef.get();
    if (entitySnap.exists) await entityRef.set({ activeSessionIds: removeActiveSession(entitySnap.data() || {}, sessionId), currentSessionId: remaining.at(-1) ?? null }, { merge: true });
    await adminDb.doc(`admin_sessions/${targetUid}/sessions/${sessionId}`).set({ isActive: false, lastActive: new Date() }, { merge: true });
    await updateSessionIndex(targetUid, sessionId, { isActive: false });
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Worker Auth] Error releasing admin session:', error);
    return c.json({ success: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/auth/invalidate-all-sessions', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    if (!canInvalidateAllSessions(c.get('user'))) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 503);

    const now = new Date();
    const sessionCollList: Array<{ name: string; entityCollection: string; fixedEntityId?: string }> = [
      { name: 'admin_sessions', entityCollection: 'admin_settings', fixedEntityId: 'auth_pin' },
      { name: 'delegate_sessions', entityCollection: 'delegates' },
      { name: 'garage_sessions', entityCollection: 'garages' },
      { name: 'staff_sessions', entityCollection: 'staff' }
    ];
    const snapshots = await Promise.all(sessionCollList.map((entry) => adminDb.collection(entry.name).get()));
    let invalidatedSessions = 0;
    let clearedEntityMarkers = 0;
    let batch = adminDb.batch();
    let batchWrites = 0;

    const commitBatchIfNeeded = async (force = false) => {
      if (batchWrites > 0 && (force || batchWrites >= 450)) {
        await batch.commit();
        batch = adminDb!.batch();
        batchWrites = 0;
      }
    };

    for (let index = 0; index < sessionCollList.length; index += 1) {
      const entry = sessionCollList[index];
      for (const sessionDoc of snapshots[index].docs) {
        const sessionData = sessionDoc.data() || {};
        if (sessionData.isActive === true) invalidatedSessions += 1;
        batch.update(sessionDoc.ref, { isActive: false, lastActive: now });
        batchWrites += 1;
        if (sessionData.uid && sessionData.sessionId) {
          batch.set(adminDb.doc(sessionIndexPath(sessionData.uid, sessionData.sessionId)), { isActive: false, updatedAt: now }, { merge: true });
          batchWrites += 1;
        }

        const entityId = entry.fixedEntityId || sessionData.entityId;
        if (entityId) {
          const entityRef = adminDb.doc(`${entry.entityCollection}/${entityId}`);
          batch.set(entityRef, { currentSessionId: null, activeSessionIds: [], lastActive: now }, { merge: true });
          batchWrites += 1;
          clearedEntityMarkers += 1;
        }
        const deviceSessions = await adminDb.collection(`${entry.name}/${sessionDoc.id}/sessions`).get();
        for (const deviceSession of deviceSessions.docs) {
          const deviceData = deviceSession.data() || {};
          if (deviceData.isActive === true) invalidatedSessions += 1;
          batch.update(deviceSession.ref, { isActive: false, lastActive: now });
          batchWrites += 1;
          if (deviceData.uid && deviceData.sessionId) {
            batch.set(adminDb.doc(sessionIndexPath(deviceData.uid, deviceData.sessionId)), { isActive: false, updatedAt: now }, { merge: true });
            batchWrites += 1;
          }
          await commitBatchIfNeeded();
        }
        await commitBatchIfNeeded();
      }
    }

    await commitBatchIfNeeded(true);
    return c.json({ success: true, invalidatedSessions, clearedEntityMarkers });
  } catch (error: any) {
    console.error('[Worker Auth] Error invalidating all sessions:', error);
    return c.json({ success: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.get('/api/auth/sessions', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const user = c.get('user');
    const sessionId = (c.req.header('x-session-id') || '').trim();
    const definition = workerSessionDefinition(user?.role);
    if (!user?.uid || !sessionId || !definition || !adminDb) return c.json({ success: false, error: 'SESSION_MANAGEMENT_REQUIRES_USER_SESSION' }, 403);
    const rootSnap = await adminDb.doc(`${definition.sessions}/${user.uid}`).get();
    const currentRoot = rootSnap.exists ? rootSnap.data() || {} : {};
    const callerSession = await adminDb.doc(`${definition.sessions}/${user.uid}/sessions/${sessionId}`).get();
    const callerData = callerSession.exists ? callerSession.data() || {} : currentRoot;
    if (!callerSession.exists && !rootSnap.exists || callerData.isActive !== true || callerData.sessionId !== sessionId) return c.json({ success: false, error: 'SESSION_INVALID' }, 401);
    const devices = await adminDb.collection(`${definition.sessions}/${user.uid}/sessions`).get();
    // "Current" is the caller's authenticated device, not the entity's
    // preferred/root marker; multiple active devices are allowed.
    const currentSessionId = sessionId;
    const sessions = devices.docs.map((doc: any) => toSessionSummary(doc.id, doc.data() || {}, currentSessionId));
    if (sessions.length === 0) sessions.push(toSessionSummary(sessionId, callerData, currentSessionId));
    return c.json({ success: true, sessions });
  } catch (error: any) {
    console.error('[Worker Auth] Error listing sessions:', error);
    return c.json({ success: false, error: 'SESSION_LIST_FAILED' }, 500);
  }
});

workerApp.delete('/api/auth/sessions/:sessionKey', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const user = c.get('user');
    const callerSessionId = (c.req.header('x-session-id') || '').trim();
    const sessionKey = (c.req.param('sessionKey') || '').trim();
    const definition = workerSessionDefinition(user?.role);
    if (!user?.uid || !callerSessionId || !definition || !/^[a-f0-9]{64}$/.test(sessionKey) || !adminDb) return c.json({ success: false, error: 'INVALID_SESSION_KEY' }, 400);
    const callerSnap = await adminDb.doc(`${definition.sessions}/${user.uid}/sessions/${callerSessionId}`).get();
    if (!callerSnap.exists || callerSnap.data()?.isActive !== true || callerSnap.data()?.sessionId !== callerSessionId) return c.json({ success: false, error: 'SESSION_INVALID' }, 401);
    const rootRef = adminDb.doc(`${definition.sessions}/${user.uid}`);
    const rootSnap = await rootRef.get();
    const devices = await adminDb.collection(`${definition.sessions}/${user.uid}/sessions`).get();
    const target = devices.docs.find((doc: any) => hashSessionId(doc.id) === sessionKey);
    if (!target) return c.json({ success: false, error: 'SESSION_NOT_FOUND' }, 404);
    const targetData = target.data() || {};
    const entityId = user.role === 'admin' ? 'auth_pin' : targetData.entityId;
    const entityRef = entityId ? adminDb.doc(`${definition.entity}/${entityId}`) : null;
    const entitySnap = entityRef ? await entityRef.get() : null;
    const remainingRoot = removeActiveSession(rootSnap.exists ? rootSnap.data() || {} : {}, target.id);
    await target.ref.set({ isActive: false, lastActive: new Date() }, { merge: true });
    await rootRef.set({ activeSessionIds: remainingRoot, ...(rootSnap.data()?.currentSessionId === target.id ? { currentSessionId: remainingRoot.at(-1) ?? null } : {}) }, { merge: true });
    if (entityRef && entitySnap?.exists) await entityRef.set({ activeSessionIds: removeActiveSession(entitySnap.data() || {}, target.id), ...(entitySnap.data()?.currentSessionId === target.id ? { currentSessionId: remainingRoot.at(-1) ?? null } : {}) }, { merge: true });
    return c.json({ success: true, revokedSession: sessionKey, wasCurrent: target.id === callerSessionId });
  } catch (error: any) {
    console.error('[Worker Auth] Error revoking session:', error);
    return c.json({ success: false, error: 'SESSION_REVOKE_FAILED' }, 500);
  }
});

}
