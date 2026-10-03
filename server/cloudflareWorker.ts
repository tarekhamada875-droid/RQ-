import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FieldValue } from './firebaseWorkerAdmin';
import { adminDb, adminAuth, initializeFirebaseAdmin } from './firebaseAdmin';
import { isValidBackendOperatorToken } from './middleware';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { recordDomainEventInTransaction } from './events';
import { evaluateFairUseCheckIn, initializeFairUse } from './unlimitedFairUse';
import { calculateVehicleCost, checkPinAvailabilityAcrossAll, saveEntityPin, cleanPin, verifyPinMatch, queryAccountWherePin, getAdminPin, migratePinToHash } from './utils';
import { validateIdempotencyKey, validatePlate, normalizePlateRaw, validateDateRange, validateId, validateNumber, validateNewPin, validateString, isNewPinFormat } from './validation';
import { mapDomainErrorToStatus } from './routes/helpers';
import { createOperationId, createVehicleDelta, nextOperationVersion, projectionBucketPath, projectionBucketUpdate, projectionShardCount, ProjectionDelta } from './deltaProjection';
import { decideVehicleCheckIn } from './domain/vehicleCheckIn';
import { fairUseResultToDecision, garageDocumentToCheckInState, vehicleDocumentToCheckInState } from './adapters/vehicleCheckInAdapter';
import { decideVehicleCheckOut } from './domain/vehicleCheckOut';
import { garageDocumentToCheckOutState, vehicleDocumentToCheckOutState } from './adapters/vehicleCheckOutAdapter';
import { authorizeVehicleGarageScope, canManageGarageScopedData as decideGarageScope, canViewFinancialReport, canSubmitGarageApplication } from './domain/authorization';
import { validatePackageCatalogRecord } from './packageCatalog';
import { decideManualCredit } from './domain/manualCredit';
import { calculateFinancialReport } from './financialReporting';
import { aggregateProjectionBuckets, isFreshDashboardSummary } from './dashboardSummary';
import { decideGarageDeletion } from './domain/garageDeletion';
import { deletionJobDocumentToState, garageDocumentToDeletionState } from './adapters/garageDeletionAdapter';
import { addActiveSession, hashSessionId, removeActiveSession, toSessionSummary } from './auth/sessionMarkers';
import {
  decideSubscriberAdd,
  decideSubscriberDelete,
  decideSubscriberRenew,
  decideSubscriberUpdate
} from './domain/subscriberLifecycle';

import {
  addRequestToCommand,
  lifecycleErrorToLegacyError,
  subscriberDocumentToState,
  transitionToFirestoreUpdate,
  updateRequestToCommand
} from './adapters/subscriberLifecycleAdapter';
import {
  checkWorkerPinRateLimit,
  resetWorkerPinRateLimit,
  PinRateLimiterNamespace
} from './workerPinRateLimiter';

export { PinRateLimiterDurableObject } from './workerPinRateLimiter';

export interface WorkerUser {
  uid: string;
  role: string;
  garageId?: string | null;
  entityId?: string;
  displayName?: string;
}

const workerApp = new Hono<{
  Bindings: {
    ENVIRONMENT?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_DATABASE_ID?: string;
    ALLOWED_ORIGINS?: string;
    BACKEND_OPERATOR_TOKEN?: string;
    WORKER_VERSION?: string;
    PIN_RATE_LIMITER?: PinRateLimiterNamespace;
  };
  Variables: {
    correlationId: string;
    operationId: string;
    user?: WorkerUser;
  };
}>();
let configuredAllowedOrigins = '';

const WORKER_SESSION_DEFINITIONS: Record<string, { sessions: string; entity: string }> = {
  admin: { sessions: 'admin_sessions', entity: 'admin_settings' },
  supervisor: { sessions: 'supervisor_sessions', entity: 'supervisors' },
  delegate: { sessions: 'delegate_sessions', entity: 'delegates' },
  garage: { sessions: 'garage_sessions', entity: 'garages' },
  staff: { sessions: 'staff_sessions', entity: 'staff' }
};

function workerSessionDefinition(role: string | undefined) {
  return role ? WORKER_SESSION_DEFINITIONS[role] : undefined;
}

function isAllowedWorkerOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, '');
  const configured = configuredAllowedOrigins.split(',').map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean);
  if (configured.includes(normalized)) return true;
  return new Set([
    'https://rq-acg.pages.dev',
    'https://aistudio.google.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ]).has(normalized);
}

// 1. Dynamic Firebase initialization with Cloudflare bindings (no process.env copying)
workerApp.use('*', async (c, next) => {
  if (c.env) {
    // Initialize Firebase Admin explicitly and dynamically with c.env bindings
    initializeFirebaseAdmin(c.env);
    configuredAllowedOrigins = c.env.ALLOWED_ORIGINS || '';
  }
  await next();
});

// 2. Correlation and Operation ID Middleware
workerApp.use('*', async (c, next) => {
  const correlationId = c.req.header('x-correlation-id') || c.req.header('x-request-id') || `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const operationId = c.req.header('x-operation-id') || `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  c.set('correlationId', correlationId);
  c.set('operationId', operationId);

  await next();

  c.res.headers.set('X-Correlation-ID', correlationId);
  c.res.headers.set('X-Operation-ID', operationId);
});

// 3. Global Error Normalization
workerApp.onError((err, c) => {
  const correlationId = c.get('correlationId') || `corr_${Date.now()}`;
  console.error(`[Worker Error] [${correlationId}]:`, err);
  const status = (err as any).statusCode || (err as any).status || 500;
  c.res.headers.set('X-Correlation-ID', correlationId);
  return c.json({
    success: false,
    error: err.message || 'INTERNAL_SERVER_ERROR',
    statusCode: status,
    correlationId,
    timestamp: new Date().toISOString()
  }, status);
});

// 4. Scoped CORS Middleware conforming to RQ security spec (no wildcard for authenticated operations)
workerApp.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (isAllowedWorkerOrigin(origin)) return origin;
    return 'https://rq-acg.pages.dev';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Backend-Operator-Token',
    'X-Session-ID',
    'X-Correlation-ID',
    'X-Operation-ID',
    'Idempotency-Key',
    'x-idempotency-key',
    'x-app-version',
    'x-request-id'
  ],
  exposeHeaders: [
    'X-Correlation-ID',
    'X-Operation-ID',
    'Idempotency-Key',
    'x-idempotency-key',
    'x-request-id'
  ]
}));

// Helper: Worker Authentication Middleware
async function requireWorkerAuth(c: any, next: () => Promise<void>) {
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

    if (adminDb && (!role || role === 'worker')) {
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
}

// 5. Foundation Routes (Directly wired in Worker)
workerApp.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-worker',
    timestamp: new Date().toISOString(),
    environment: c.env?.ENVIRONMENT || 'production',
    adminSdk: !!(adminDb && adminAuth),
    version: c.env?.WORKER_VERSION || process.env.WORKER_VERSION || '1.0.0'
  });
});

workerApp.get('/api/version', (c) => {
  return c.json({
    version: c.env?.WORKER_VERSION || process.env.WORKER_VERSION || '1.0.0',
    environment: c.env?.ENVIRONMENT || 'production',
    runtime: 'cloudflare-worker',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

// Authentication routes must be Fetch-native in the Worker. The old Express
// router is not bundled into Cloudflare, so keep the server-owned PIN lookup,
// validation, and atomic session claim here.
workerApp.post('/api/auth/verify-pin', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;

  try {
    const credentials = await c.req.json().catch(() => ({} as Record<string, any>));
    const currentUser = c.get('user');
    const effectiveUid = currentUser?.uid || '';
    const suppliedUid = typeof credentials.uid === 'string' ? credentials.uid.trim() : '';
    if (!effectiveUid) return c.json({ success: false, error: 'UNAUTHORIZED' }, 401);
    if (suppliedUid && suppliedUid !== effectiveUid) return c.json({ success: false, error: 'UID_MISMATCH' }, 401);

    const sessionId = typeof credentials.sessionId === 'string' ? credentials.sessionId.trim() : '';
    if (!sessionId) return c.json({ success: false, error: 'SESSION_ID_REQUIRED' }, 400);

    const rawInput = credentials.pin || credentials.input;
    const normalizedPin = cleanPin(rawInput);
    if (!normalizedPin || !isNewPinFormat(normalizedPin)) return c.json({ success: false, error: 'بيانات الدخول غير صحيحة' });

    const clientIp = c.req.header('cf-connecting-ip') || 'unknown';
    let pinLimit: Awaited<ReturnType<typeof checkWorkerPinRateLimit>>;
    try {
      pinLimit = await checkWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, effectiveUid, clientIp);
    } catch (error: any) {
      console.error('[Worker Auth] PIN rate limiter unavailable:', error?.message || 'unknown');
      return c.json({ success: false, error: 'RATE_LIMITER_UNAVAILABLE' }, 503);
    }
    if (pinLimit.allowed === false) {
      return c.json({ success: false, error: 'RATE_LIMIT_EXCEEDED', resetAt: pinLimit.resetAt }, 429);
    }

    const collectionsToCheck: Array<{ name: string; role: 'supervisor' | 'delegate' | 'staff' | 'garage' }> = [
      { name: 'garages', role: 'garage' },
      { name: 'staff', role: 'staff' },
      { name: 'delegates', role: 'delegate' },
      { name: 'supervisors', role: 'supervisor' }
    ];
    const [adminPinStored, ...collectionResults] = await Promise.all([
      getAdminPin(),
      ...collectionsToCheck.map((collection) => queryAccountWherePin(collection.name, normalizedPin))
    ]);

    const matches: Array<{ role: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage'; id: string; account?: any; isLegacyMatch?: boolean }> = [];
    const adminCheck = verifyPinMatch(normalizedPin, adminPinStored);
    if (adminCheck.matches) {
      matches.push({ role: 'admin', id: 'admin', isLegacyMatch: adminCheck.isLegacy });
      if (adminCheck.isLegacy) await migratePinToHash('admin_settings', 'auth_pin', normalizedPin);
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
        if (docSnap.isLegacyMatch) await migratePinToHash(collection.name, docSnap.id, normalizedPin);
      }
    }

    if (matches.length > 1) return c.json({ success: false, error: 'PIN_NOT_UNIQUE' });
    if (matches.length === 0) return c.json({ success: false, error: 'بيانات الدخول غير صحيحة' });

    const match = matches[0];
    const entityCollMap: Record<string, string> = { admin: 'admin_settings', supervisor: 'supervisors', delegate: 'delegates', garage: 'garages', staff: 'staff' };
    const secCollMap: Record<string, string> = { admin: 'admin_sessions', supervisor: 'supervisor_sessions', delegate: 'delegate_sessions', garage: 'garage_sessions', staff: 'staff_sessions' };
    const entityColl = entityCollMap[match.role];
    const secColl = secCollMap[match.role];
    const entityDocId = match.role === 'admin' ? 'auth_pin' : match.id;
    if (!adminDb || !entityColl || !secColl) return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);

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
    });

    try {
      await resetWorkerPinRateLimit(c.env?.PIN_RATE_LIMITER, effectiveUid, clientIp);
    } catch (error: any) {
      console.error('[Worker Auth] PIN rate limiter reset failed after successful claim:', error?.message || 'unknown');
    }

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
    });
    return c.json({ success: true, sessionClaimed: true });
  } catch (error: any) {
    console.error('[Worker Auth] Error claiming admin session:', error?.message || 'unknown');
    return c.json({ success: false, error: 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/auth/validate-or-refresh-session', async (c) => {
  const authResult = await requireWorkerAuth(c, async () => undefined);
  if (authResult instanceof Response) return authResult;
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { uid, sessionId, role, entityId } = body;
    const effectiveUid = c.get('user')?.uid || '';
    if (!uid || !sessionId || !role) return c.json({ success: false, valid: false, error: 'INVALID_PARAMS' }, 400);
    if (!effectiveUid) return c.json({ success: false, valid: false, error: 'UNAUTHORIZED' }, 401);
    if (String(uid).trim() !== effectiveUid) return c.json({ success: false, valid: false, error: 'UID_MISMATCH' }, 401);
    if (!adminDb) return c.json({ success: false, valid: false, error: 'DATABASE_UNAVAILABLE' }, 503);

    const secCollMap: Record<string, string> = { admin: 'admin_sessions', supervisor: 'supervisor_sessions', delegate: 'delegate_sessions', garage: 'garage_sessions', staff: 'staff_sessions' };
    const entityCollMap: Record<string, string> = { admin: 'admin_settings', supervisor: 'supervisors', delegate: 'delegates', garage: 'garages', staff: 'staff' };
    const secColl = secCollMap[role];
    const entityColl = entityCollMap[role];
    if (!secColl || !entityColl) return c.json({ success: false, valid: false, error: 'INVALID_ROLE' });

    const rootRef = adminDb.doc(`${secColl}/${effectiveUid}`);
    const deviceRef = adminDb.doc(`${secColl}/${effectiveUid}/sessions/${sessionId}`);
    const rootSnap = await rootRef.get();
    const deviceSnap = await deviceRef.get();
    const sessionSnap = deviceSnap.exists ? deviceSnap : rootSnap;
    if (!sessionSnap.exists) return c.json({ success: false, valid: false, error: 'SESSION_NOT_FOUND' });
    const sessionData = sessionSnap.data() || {};
    if (!sessionData.isActive || sessionData.sessionId !== sessionId) return c.json({ success: false, valid: false, error: 'SESSION_INVALID' });

    const lastActiveValue = sessionData.lastActive;
    const lastActive = lastActiveValue?.toDate ? lastActiveValue.toDate().getTime() : new Date(lastActiveValue || 0).getTime();
    if (!lastActive || Date.now() - lastActive > 24 * 60 * 60 * 1000) {
      await rootRef.set({ isActive: false }, { merge: true });
      return c.json({ success: false, valid: false, error: 'SESSION_EXPIRED' });
    }

    // The security session is the authoritative record for heartbeat checks.
    // Entity snapshots can lag briefly after the atomic claim; rejecting here
    // would send a valid newly signed-in user into a false session-expired loop.
    const targetEntityId = role === 'admin' ? 'auth_pin' : entityId;
    if (targetEntityId) await adminDb.doc(`${entityColl}/${targetEntityId}`).set({ lastActive: new Date() }, { merge: true });
    await rootRef.set({ lastActive: new Date() }, { merge: true });
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
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 503);

    let authorized = verifiedUid === targetUid;
    if (!authorized) {
      const [adminSnap, supervisorSnap] = await Promise.all([
        adminDb.doc(`admin_sessions/${verifiedUid}`).get(),
        adminDb.doc(`supervisor_sessions/${verifiedUid}`).get()
      ]);
      authorized = Boolean((adminSnap.exists && adminSnap.data()?.isActive) || (supervisorSnap.exists && supervisorSnap.data()?.isActive));
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
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Worker Auth] Error releasing admin session:', error);
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
    const currentSessionId = currentRoot.currentSessionId || currentRoot.sessionId || sessionId;
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

// Foundation Route: GET /api/system-config
workerApp.get('/api/system-config', async (c) => {
  try {
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }
    const snap = await adminDb.doc('system_config/global').get();
    if (!snap.exists) {
      return c.json({
        success: true,
        config: {
          defaultTrialDays: 2,
          warningDaysThreshold: 3,
          walletNumber: '',
          monthlySubscribersFlatFee: 250,
          monthlySubscribersSurchargePercent: 25,
          referralFeePerRenewal: 100,
          delegateMonthlyCommission: 100,
          isMaintenanceMode: false,
          maintenanceMessage: '',
          adminColor: '#10b981'
        }
      });
    }
    return c.json({ success: true, config: { id: snap.id, ...snap.data() } });
  } catch (e: any) {
    console.error('[Worker] Error fetching system-config:', e);
    return c.json({ success: false, error: 'SERVER_ERROR' }, 500);
  }
});

// Foundation Route: POST /api/admin/update-system-config
workerApp.post('/api/admin/update-system-config', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const body = await c.req.json().catch(() => ({}));
    const updatePayload: Record<string, any> = {
      updatedAt: new Date()
    };

    if (body.walletNumber !== undefined) {
      updatePayload.walletNumber = String(body.walletNumber).trim();
    }
    if (body.defaultTrialDays !== undefined) {
      updatePayload.defaultTrialDays = Number(body.defaultTrialDays) || 2;
    }
    if (body.warningDaysThreshold !== undefined) {
      updatePayload.warningDaysThreshold = Number(body.warningDaysThreshold) || 3;
    }
    if (body.monthlySubscribersFlatFee !== undefined) {
      updatePayload.monthlySubscribersFlatFee = Number(body.monthlySubscribersFlatFee) || 250;
    }
    if (body.monthlySubscribersSurchargePercent !== undefined) {
      updatePayload.monthlySubscribersSurchargePercent = Number(body.monthlySubscribersSurchargePercent) || 25;
    }
    if (body.referralFeePerRenewal !== undefined) {
      updatePayload.referralFeePerRenewal = Number(body.referralFeePerRenewal) || 100;
    }
    if (body.delegateMonthlyCommission !== undefined) {
      updatePayload.delegateMonthlyCommission = Number(body.delegateMonthlyCommission) || 100;
    }
    if (body.isMaintenanceMode !== undefined) {
      updatePayload.isMaintenanceMode = !!body.isMaintenanceMode;
    }
    if (body.maintenanceMessage !== undefined) {
      updatePayload.maintenanceMessage = String(body.maintenanceMessage).trim();
    }
    if (body.adminColor !== undefined) {
      updatePayload.adminColor = String(body.adminColor).trim();
    }
    if (body.subscriptionPrices !== undefined) {
      updatePayload.subscriptionPrices = body.subscriptionPrices;
    }

    await adminDb.doc('system_config/global').set(updatePayload, { merge: true });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Admin] Error in update-system-config:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Helper to sanitize delegate objects by removing private PIN fields
function sanitizeDelegateDoc<T extends Record<string, any>>(data: T): Omit<T, 'pin' | 'ownerPin' | 'adminPin' | 'pinHash' | 'pinLookupHash'> {
  const sanitized = { ...data };
  delete sanitized.pin;
  delete sanitized.ownerPin;
  delete sanitized.adminPin;
  delete sanitized.pinHash;
  delete sanitized.pinLookupHash;
  return sanitized;
}

function safeDateMillis(val: any): number {
  if (!val) return 0;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (val instanceof Date) return val.getTime();
  if (typeof val === 'number') return val;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

// 6. Public and Read-Heavy Business Routes (CF4)

// Route 1: POST /api/check-subscriber
workerApp.post('/api/check-subscriber', async (c) => {
  try {
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }
    const body = await c.req.json().catch(() => ({}));
    const garageId = body.garageId ? String(body.garageId).trim() : '';
    const plateNumber = body.plateNumber || body.plate || '';
    const plateRaw = body.plateRaw || body.plateNumberRaw || plateNumber;
    const subscriberId = body.subscriberId ? String(body.subscriberId).trim() : '';
    const phone = body.phone ? String(body.phone).trim() : '';

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }

    const subCollection = adminDb.collection(`garages/${garageId}/subscribers`);
    let foundDoc: any = null;

    if (subscriberId) {
      const snap = await subCollection.doc(subscriberId).get();
      if (snap.exists) {
        foundDoc = { id: snap.id, ...snap.data() };
      }
    }

    if (!foundDoc && plateRaw) {
      const snap = await subCollection.where('plateNumberRaw', '==', plateRaw).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        foundDoc = { id: doc.id, ...doc.data() };
      }
    }

    if (!foundDoc && plateNumber) {
      const snap = await subCollection.where('plateNumber', '==', plateNumber).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        foundDoc = { id: doc.id, ...doc.data() };
      }
    }

    if (!foundDoc && phone) {
      const snap = await subCollection.where('phone', '==', phone).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        foundDoc = { id: doc.id, ...doc.data() };
      }
    }

    if (!foundDoc) {
      return c.json({
        success: true,
        isSubscriber: false,
        isActive: false,
        subscriber: null
      });
    }

    // Check if subscriber is active based on end date
    const now = Date.now();
    const endMillis = safeDateMillis(foundDoc.endDate);
    const startMillis = safeDateMillis(foundDoc.startDate);
    const isActive = (endMillis === 0 || endMillis >= now) && (startMillis === 0 || startMillis <= now);

    return c.json({
      success: true,
      isSubscriber: true,
      isActive,
      subscriber: foundDoc
    });
  } catch (err: any) {
    console.error('[Worker] Error in check-subscriber:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 2: GET /api/garage-summary
workerApp.get('/api/garage-summary', requireWorkerAuth, async (c) => {
  try {
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }
    const user = c.get('user');
    const garageId = c.req.query('garageId') || user?.garageId || (user?.role === 'garage' ? user?.entityId : null);

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }

    const isAdmin = user?.role === 'admin';
    const isGarageScoped = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);

    if (!isAdmin && !isGarageScoped) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage summary scope required' }, 403);
    }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    const [garageSnap, insideVehiclesSnap, subscribersSnap, dailyStatsSnap] = await Promise.all([
      adminDb.doc(`garages/${garageId}`).get(),
      adminDb.collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get(),
      adminDb.collection(`garages/${garageId}/subscribers`).get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get()
    ]);

    if (!garageSnap.exists) {
      return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
    }

    const garageData = garageSnap.data() || {};
    const dailyStats = dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {};
    const now = Date.now();

    const activeSubscribers = subscribersSnap.docs.filter((doc: any) => {
      const data = doc.data() || {};
      const end = safeDateMillis(data.endDate);
      return end === 0 || end >= now;
    }).length;

    return c.json({
      success: true,
      data: {
        garageId,
        name: garageData.name || '',
        carsInside: insideVehiclesSnap.size,
        activeSubscribersCount: activeSubscribers,
        totalSubscribersCount: subscribersSnap.size,
        todayEntries: Number(dailyStats.count || 0),
        todayRevenue: Number(dailyStats.revenue || dailyStats.netRevenue || 0),
        balanceExpiry: garageData.balanceExpiry || null,
        isTrial: Boolean(garageData.isTrial),
        dailyCapacity: Number(garageData.dailyCapacity || 0),
        hourlyRate: Number(garageData.hourlyRate || 0)
      }
    });
  } catch (err: any) {
    console.error('[Worker] Error in garage-summary:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 3: GET /api/admin/summary
workerApp.get('/api/admin/summary', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const [garagesSnap, delegatesSnap, supervisorsSnap, rechargeRequestsSnap, announcementsSnap] = await Promise.all([
      adminDb.collection('garages').get(),
      adminDb.collection('delegates').get(),
      adminDb.collection('supervisors').get(),
      adminDb.collection('recharge_requests').where('status', '==', 'pending').get(),
      adminDb.collection('announcements').where('isActive', '==', true).get()
    ]);

    const now = Date.now();
    let activeGarages = 0;
    garagesSnap.docs.forEach((doc: any) => {
      const data = doc.data() || {};
      const expiry = safeDateMillis(data.balanceExpiry);
      if (!data.isTrial || expiry >= now) {
        activeGarages += 1;
      }
    });

    return c.json({
      success: true,
      summary: {
        totalGarages: garagesSnap.size,
        activeGarages,
        totalDelegates: delegatesSnap.size,
        totalSupervisors: supervisorsSnap.size,
        pendingRechargeRequests: rechargeRequestsSnap.size,
        activeAnnouncements: announcementsSnap.size,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin summary:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 4: GET /api/admin/monthly-subscribers-summary
workerApp.get('/api/admin/monthly-subscribers-summary', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const subscribersSnap = await adminDb.collectionGroup('subscribers').get();
    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;
    const distinctGarages = new Set<string>();

    subscribersSnap.docs.forEach((doc: any) => {
      const data = doc.data() || {};
      const end = safeDateMillis(data.endDate);
      if (end === 0 || end >= now) {
        activeCount += 1;
      } else {
        expiredCount += 1;
      }
      if (data.garageId) {
        distinctGarages.add(data.garageId);
      }
    });

    return c.json({
      success: true,
      data: {
        totalSubscribers: subscribersSnap.size,
        activeSubscribers: activeCount,
        expiredSubscribers: expiredCount,
        garagesCount: distinctGarages.size,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in monthly-subscribers-summary:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 5: GET /api/admin/subscribers
workerApp.get('/api/admin/subscribers', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const garageId = c.req.query('garageId');
    const limitQuery = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));
    const status = c.req.query('status') || 'all';

    let docs: any[] = [];
    if (garageId) {
      const snap = await adminDb.collection(`garages/${garageId}/subscribers`).limit(limitQuery).get();
      docs = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    } else {
      const snap = await adminDb.collectionGroup('subscribers').limit(limitQuery).get();
      docs = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    }

    const now = Date.now();
    if (status === 'active') {
      docs = docs.filter((sub) => {
        const end = safeDateMillis(sub.endDate);
        return end === 0 || end >= now;
      });
    } else if (status === 'expired') {
      docs = docs.filter((sub) => {
        const end = safeDateMillis(sub.endDate);
        return end > 0 && end < now;
      });
    }

    return c.json({
      success: true,
      subscribers: docs,
      count: docs.length
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin subscribers:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 6: GET /api/admin/delegates
workerApp.get('/api/admin/delegates', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const delegatesSnap = await adminDb.collection('delegates').get();
    const delegates = delegatesSnap.docs
      .map((doc: any) => sanitizeDelegateDoc({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => safeDateMillis(b.createdAt) - safeDateMillis(a.createdAt));

    return c.json({
      success: true,
      delegates
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin delegates:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 7: GET /api/admin/delegates/:id
workerApp.get('/api/admin/delegates/:id', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const delegateId = c.req.param('id');
    const delegateRef = adminDb.collection('delegates').doc(delegateId);
    const [delegateSnap, createdGaragesSnap, referredGaragesSnap, requestsSnap] = await Promise.all([
      delegateRef.get(),
      adminDb.collection('garages').where('createdByDelegateId', '==', delegateId).get(),
      adminDb.collection('garages').where('referrerId', '==', delegateId).get(),
      adminDb.collection('recharge_requests').where('delegateId', '==', delegateId).get()
    ]);

    if (!delegateSnap.exists) {
      return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    }

    const garagesById = new Map<string, any>();
    for (const snap of [createdGaragesSnap, referredGaragesSnap]) {
      for (const garage of snap.docs) {
        garagesById.set(garage.id, sanitizeDelegateDoc({ id: garage.id, ...garage.data() }));
      }
    }

    const requests = requestsSnap.docs
      .map((req: any) => ({ id: req.id, ...req.data() }))
      .sort((a: any, b: any) => safeDateMillis(b.createdAt) - safeDateMillis(a.createdAt));

    return c.json({
      success: true,
      delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
      garages: Array.from(garagesById.values()),
      requests
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin delegate details:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

function writeProjectionBucket(transaction: any, garageId: string, dateId: string, operationId: string, delta: ProjectionDelta): void {
  if (!adminDb || Object.keys(delta).length === 0) return;
  const configuredRate = Number(process.env.PROJECTION_OPERATIONS_PER_SECOND || 1);
  const shardCount = projectionShardCount(Number.isFinite(configuredRate) ? configuredRate : 1);
  const bucket = projectionBucketUpdate(operationId, dateId, delta, shardCount);
  const bucketRef = adminDb.doc(projectionBucketPath(garageId, dateId, operationId, shardCount));
  const increments = Object.fromEntries(Object.entries(delta).map(([field, value]) => [field, FieldValue.increment(Number(value || 0))]));
  transaction.set(bucketRef, { ...increments, operationId: bucket.operationId, projectionVersion: bucket.projectionVersion, dateId: bucket.dateId, shard: bucket.shard, updatedAt: new Date() }, { merge: true });
}

// 7. Vehicle Operations & Operational Flow (CF5)

// Route 1: POST /api/vehicles/check-in
workerApp.post('/api/vehicles/check-in', requireWorkerAuth, async (c) => {
  const requestStartedAt = Date.now();
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId: bodyGarageId, plateNumber: rawPlateNumber, plateRaw: rawPlateRaw, type } = body;
    const normalizedPlate = validatePlate(rawPlateNumber || rawPlateRaw);
    const plateNumber = normalizedPlate.plateNumber;
    const plateRaw = normalizedPlate.plateRaw;
    const callerRole = user?.role;
    const scope = authorizeVehicleGarageScope(user, bodyGarageId);
    if (scope.allowed === false) {
      if (scope.reason === 'garage_id_missing') {
        return c.json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' }, 403);
      }
      if (scope.reason === 'garage_scope_mismatch') {
        return c.json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' }, 403);
      }
      return c.json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' }, 403);
    }
    const garageId = scope.garageId as string;
    const staffId = user?.uid;

    if (!garageId || !plateNumber || !plateRaw) {
      return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const requestFingerprint = createRequestFingerprint({ garageId, plateNumber, plateRaw, type: type || 'hourly' });
    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let resultData: Record<string, any> = {};
    let isSubscriberAuthoritative = false;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-in', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || {};
          return;
        }
      }
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${plateRaw}`);
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);

      const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garageData = garageSnap.data() || {};

      isSubscriberAuthoritative = false;
      try {
        const subscriberCollection = adminDb.collection(`garages/${garageId}/subscribers`);
        const [subSnapRaw, subSnapPlate] = await Promise.all([
          t.get(subscriberCollection.where('plateNumberRaw', '==', plateRaw)),
          t.get(subscriberCollection.where('plateNumber', '==', plateNumber))
        ]);
        for (const doc of [...subSnapRaw.docs, ...subSnapPlate.docs]) {
          const subData = doc.data() || {};
          const startDate = subData.startDate || '';
          const endDate = subData.endDate || '';
          if (startDate && endDate && today >= startDate && today <= endDate) {
            isSubscriberAuthoritative = true;
            break;
          }
        }
      } catch (subErr) {
        console.warn('[Worker Check-In] Subscriber lookup failed inside transaction:', subErr);
        throw new Error('SUBSCRIBER_LOOKUP_UNAVAILABLE', { cause: subErr });
      }

      const resolvedStaffName = user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? 'مدير الجراج' : 'موظف'));
      const checkInGarage = garageDocumentToCheckInState(garageData, isSubscriberAuthoritative);
      const checkInVehicle = vehicleDocumentToCheckInState(vehicleSnap.exists ? vehicleSnap.data() || {} : null);
      const isUnlimited = checkInGarage.dailyCapacity === 0 || checkInGarage.activePackageName.includes('مفتوح');
      let fairUseDecision = null;
      if (isUnlimited) {
        const evalResult = evaluateFairUseCheckIn(
          garageData.unlimitedFairUse,
          garageData.durationDays || 30,
          garageData.activePackageName || ''
        );
        fairUseDecision = fairUseResultToDecision(evalResult);
      }
      const decision = decideVehicleCheckIn(
        { today, nowMs: Date.now(), plateNumber, plateNumberRaw: plateRaw },
        checkInGarage,
        checkInVehicle,
        fairUseDecision
      );
      if (decision.ok === false) throw new Error(decision.error);
      const { isNewDay, used, capacity } = decision.value;
      const updatedFairUse = decision.value.fairUse?.updatedFairUse;
      const didAutoExtend = decision.value.fairUse?.autoExtended === true;

      t.set(vehicleRef, {
        id: plateRaw,
        plate: plateNumber,
        plateNumber,
        plateNumberRaw: plateRaw,
        type: type || 'hourly',
        isSubscriber: isSubscriberAuthoritative,
        entryTime: new Date(),
        status: 'inside',
        staffId: staffId || null,
        staffName: resolvedStaffName,
        enteredByUid: user?.uid || null,
        operationId,
        operationVersion: nextOperationVersion(vehicleSnap.data()?.operationVersion)
      }, { merge: true });

      const garageUpdate: any = {
        carsInside: (garageData.carsInside || 0) + 1,
        todayCount: isNewDay ? 1 : used + 1,
        todayRevenue: isNewDay ? 0 : (garageData.todayRevenue || 0),
        lastTransactionDate: today
      };
      if (updatedFairUse) {
        garageUpdate.unlimitedFairUse = updatedFairUse;
      }

      t.set(garageRef, garageUpdate, { merge: true });

      if (didAutoExtend && updatedFairUse) {
        const autoExtLogRef = adminDb.collection('activity_logs').doc();
        t.set(autoExtLogRef, {
          garageId,
          garageName: garageData.name || '',
          staffId: 'system',
          staffName: 'نظام الاستخدام العادل',
          actionType: 'fair_use_auto_extended',
          plateNumber: `تمديد تلقائي لسعة الباقة (+${updatedFairUse.stepAmount} سيارة)`,
          timestamp: new Date(),
          details: {
            currentAllowance: updatedFairUse.currentAllowance,
            maxAllowance: updatedFairUse.maxAllowance,
            cycleCarsCount: updatedFairUse.cycleCarsCount,
            tierType: updatedFairUse.tierType
          }
        });
      }

      if (!dailyStatsSnap.exists) {
        t.set(dailyStatsRef, {
          dateId: today,
          count: 1,
          limit: isUnlimited ? 0 : capacity,
          revenue: 0,
          createdAt: new Date()
        });
      } else {
        t.set(dailyStatsRef, { count: (dailyStatsSnap.data()?.count || 0) + 1 }, { merge: true });
      }

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || null,
        staffName: resolvedStaffName,
        actionType: 'check_in',
        plateNumber,
        timestamp: new Date(),
        amount: 0
      });

      resultData = {
        isSubscriber: isSubscriberAuthoritative,
        vehicle: {
          id: plateRaw,
          plateNumber,
          plateNumberRaw: plateRaw,
          type: type || 'hourly',
          status: 'inside',
          entryTime: new Date().toISOString(),
          staffId: staffId || null,
          staffName: resolvedStaffName,
          isSubscriber: isSubscriberAuthoritative
        },
        carsInside: Number(garageUpdate.carsInside || 0),
        dailyCount: Number(garageUpdate.todayCount || 0),
        dailyCapacity: isUnlimited ? 0 : capacity
      };

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: plateRaw,
        eventType: 'vehicle_entered',
        actorUid: user?.uid || staffId || 'system',
        actorRole: callerRole || 'staff',
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber,
          plateNumberRaw: plateRaw,
          type: type || 'hourly',
          isSubscriber: isSubscriberAuthoritative,
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleSnap.data()?.operationVersion),
          projectionDelta: createVehicleDelta('vehicle_entered')
        }
      });
      writeProjectionBucket(t, garageId, today, operationId, createVehicleDelta('vehicle_entered'));

      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/vehicles/check-in', user?.uid, requestFingerprint);
      }
    });

    const durationMs = Date.now() - requestStartedAt;
    c.header('Server-Timing', `check-in;dur=${durationMs}`);
    return c.json({ success: true, data: resultData });
  } catch (err: any) {
    console.error('[Worker] Check-in error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 2: POST /api/vehicles/check-out
workerApp.post('/api/vehicles/check-out', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId: bodyGarageId, vehicleId } = body;
    const callerRole = user?.role;
    const scope = authorizeVehicleGarageScope(user, bodyGarageId);
    if (scope.allowed === false) {
      if (scope.reason === 'garage_id_missing') {
        return c.json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' }, 403);
      }
      if (scope.reason === 'garage_scope_mismatch') {
        return c.json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' }, 403);
      }
      return c.json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' }, 403);
    }
    const garageId = scope.garageId as string;
    const staffId = user?.uid;

    if (!garageId || !vehicleId) {
      return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestFingerprint = createRequestFingerprint({ garageId, vehicleId });

    const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const operationId = createOperationId(garageId, idempotencyKey || undefined);

    let finalCost = 0;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/check-out', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          finalCost = Number(duplicate.cachedResult?.cost || 0);
          return;
        }
      }
      const canonicalVehicleId = normalizePlateRaw(vehicleId) || vehicleId;
      const garageRef = adminDb.doc(`garages/${garageId}`);
      let vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const today = getCairoDateKey();
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);

      let [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!vehicleSnap.exists && canonicalVehicleId !== vehicleId) {
        const altRef = adminDb.doc(`garages/${garageId}/vehicles/${canonicalVehicleId}`);
        const altSnap = await t.get(altRef);
        if (altSnap.exists) {
          vehicleRef = altRef;
          vehicleSnap = altSnap;
        }
      }

      const garageData = garageSnap.exists ? garageSnap.data() || {} : {};
      const vehicleData = vehicleSnap.exists ? vehicleSnap.data() || {} : {};
      const checkOutGarage = garageDocumentToCheckOutState(garageSnap.exists ? garageData : null);
      const checkOutVehicle = vehicleDocumentToCheckOutState(vehicleSnap.exists ? vehicleData : null);
      const preflight = decideVehicleCheckOut({ today, cost: 0 }, checkOutGarage, checkOutVehicle);
      if (preflight.ok === false) throw new Error(preflight.error);

      const resolvedStaffName = user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? 'مدير الجراج' : 'موظف'));

      const cost = calculateVehicleCost(vehicleData, garageData);
      const decision = decideVehicleCheckOut({ today, cost }, checkOutGarage, checkOutVehicle);
      if (decision.ok === false) throw new Error(decision.error);
      const { cost: finalDecisionCost, isNewDay } = decision.value;
      finalCost = finalDecisionCost;

      t.set(vehicleRef, {
        status: 'outside',
        exitTime: new Date(),
        totalCost: finalDecisionCost,
        operationId,
        operationVersion: nextOperationVersion(vehicleData.operationVersion)
      }, { merge: true });

      t.set(garageRef, {
        totalRevenue: (garageData.totalRevenue || 0) + finalDecisionCost,
        totalVehiclesOut: (garageData.totalVehiclesOut || 0) + 1,
        todayRevenue: isNewDay ? finalDecisionCost : (garageData.todayRevenue || 0) + finalDecisionCost,
        todayCount: isNewDay ? 0 : (garageData.todayCount || 0),
        lastTransactionDate: today,
        carsInside: Math.max(0, (garageData.carsInside || 0) - 1)
      }, { merge: true });

      if (!dailyStatsSnap.exists) {
        t.set(dailyStatsRef, {
          dateId: today,
          count: 0,
          revenue: finalDecisionCost,
          createdAt: new Date()
        });
      } else {
        t.set(dailyStatsRef, { revenue: (dailyStatsSnap.data()?.revenue || 0) + finalDecisionCost }, { merge: true });
      }

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || null,
        staffName: resolvedStaffName,
        actionType: 'check_out',
        plateNumber: vehicleData.plateNumber,
        plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
        entryTime: vehicleData.entryTime,
        type: vehicleData.type || 'hourly',
        isSubscriber: !!vehicleData.isSubscriber,
        timestamp: new Date(),
        amount: finalDecisionCost
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: vehicleId,
        eventType: 'vehicle_exited',
        actorUid: user?.uid || staffId || 'system',
        actorRole: callerRole || 'staff',
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber: vehicleData.plateNumber || vehicleId,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          type: vehicleData.type || 'hourly',
          isSubscriber: !!vehicleData.isSubscriber,
          cost: finalDecisionCost,
          entryTime: vehicleData.entryTime,
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleData.operationVersion),
          projectionDelta: createVehicleDelta('vehicle_exited', finalDecisionCost)
        }
      });
      writeProjectionBucket(t, garageId, today, operationId, createVehicleDelta('vehicle_exited', finalDecisionCost));
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { cost: finalDecisionCost }, '/api/vehicles/check-out', user?.uid, requestFingerprint);
      }
    });

    return c.json({ success: true, data: { cost: finalCost } });
  } catch (err: any) {
    console.error('[Worker] Check-out error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 3 & 4: POST /api/vehicles/delete & POST /api/vehicles/refund
const handleVehicleDeleteOrRefund = async (c: any) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId: bodyGarageId, vehicleId, refundAmount } = body;
    const callerRole = user?.role;
    let garageId = '';

    if (callerRole === 'garage' || callerRole === 'staff') {
      if (!user?.garageId) {
        return c.json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' }, 403);
      }
      if (bodyGarageId && bodyGarageId !== user.garageId) {
        return c.json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' }, 403);
      }
      garageId = user.garageId;
    } else if (callerRole === 'admin') {
      garageId = bodyGarageId;
    } else {
      return c.json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' }, 403);
    }

    const staffId = user?.uid;

    if (!garageId || !vehicleId) {
      return c.json({ success: false, error: 'MISSING_PARAMETERS' }, 400);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/vehicles/delete', user?.uid);
        if (duplicate.isDuplicate) return;
      }
      const todayYMD = getCairoDateKey();
      const operationId = createOperationId(garageId, idempotencyKey || undefined);
      const canonicalVehicleId = normalizePlateRaw(vehicleId) || vehicleId;
      const garageRef = adminDb.doc(`garages/${garageId}`);
      let vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
      const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${todayYMD}`);

      let [garageDoc, vehicleDoc, dailyStatsDoc] = await Promise.all([
        t.get(garageRef),
        t.get(vehicleRef),
        t.get(dailyStatsRef)
      ]);

      if (!vehicleDoc.exists && canonicalVehicleId !== vehicleId) {
        const altRef = adminDb.doc(`garages/${garageId}/vehicles/${canonicalVehicleId}`);
        const altSnap = await t.get(altRef);
        if (altSnap.exists) {
          vehicleRef = altRef;
          vehicleDoc = altSnap;
        }
      }

      if (!garageDoc.exists) throw new Error('GARAGE_NOT_FOUND');
      if (!vehicleDoc.exists) throw new Error('VEHICLE_NOT_FOUND');

      const garageData = garageDoc.data() || {};
      const vehicleData = vehicleDoc.data() || {};

      const resolvedStaffName = user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));

      if (callerRole !== 'admin') {
        const entrantUid = vehicleData.enteredByUid || vehicleData.staffUid || vehicleData.staffId;
        const callerUid = user?.uid;
        const callerEntityId = user?.entityId;

        if (entrantUid && entrantUid !== callerUid && entrantUid !== callerEntityId) {
          throw new Error('CORRECTION_FORBIDDEN: Only the staff member who entered the vehicle can correct or delete it');
        }
      }

      const todayDeletions = garageData.lastDeletionDate === todayYMD ? (garageData.dailyDeletionCount || 0) : 0;
      if (todayDeletions >= 3 && callerRole !== 'admin') {
        throw new Error('reached_daily_deletion_limit');
      }

      const isSameRefundDay = garageData.lastRefundDate === todayYMD;
      const requestedRefund = Math.max(0, Number(refundAmount || 0));
      const maxEligibleRefund = (vehicleData.status === 'outside' && typeof vehicleData.totalCost === 'number')
        ? Math.max(0, vehicleData.totalCost)
        : 0;
      const refundAmt = Math.min(requestedRefund, maxEligibleRefund);

      let enteredToday = false;
      if (vehicleData.status === 'inside' && vehicleData.entryTime) {
        const entryTime = vehicleData.entryTime.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
        if (!isNaN(entryTime.getTime())) {
          const entryDateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(entryTime);
          enteredToday = entryDateKey === todayYMD;
        }
      }

      t.delete(vehicleRef);

      const updates: any = {
        dailyDeletionCount: todayDeletions + 1,
        lastDeletionDate: todayYMD
      };
      if (refundAmt > 0) {
        updates.dailyRefundCount = isSameRefundDay ? ((garageData.dailyRefundCount || 0) + 1) : 1;
        updates.lastRefundDate = todayYMD;
      }

      if (refundAmt > 0) {
        updates.todayRevenue = Math.max(0, Number(((garageData.todayRevenue || 0) - refundAmt).toFixed(2)));
        updates.totalRevenue = Math.max(0, Number(((garageData.totalRevenue || 0) - refundAmt).toFixed(2)));
      }
      if (vehicleData.status === 'inside') updates.carsInside = Math.max(0, (garageData.carsInside || 0) - 1);
      if (enteredToday) updates.todayCount = Math.max(0, (garageData.todayCount || 0) - 1);

      t.set(garageRef, updates, { merge: true });

      if (dailyStatsDoc.exists) {
        const statsUpdates: any = {};
        if (enteredToday) {
          const prevCount = dailyStatsDoc.data()?.count || 0;
          if (prevCount > 0) statsUpdates.count = prevCount - 1;
        }
        if (refundAmt > 0) {
          const prevRev = dailyStatsDoc.data()?.revenue || 0;
          statsUpdates.revenue = Math.max(0, Number((prevRev - refundAmt).toFixed(2)));
        }
        if (Object.keys(statsUpdates).length > 0) {
          t.set(dailyStatsRef, statsUpdates, { merge: true });
        }
      }

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: staffId || vehicleData.staffId || null,
        staffName: resolvedStaffName,
        actionType: 'delete_refund',
        plateNumber: `مسح لوحة: ${vehicleData.plateNumber || vehicleId}`,
        timestamp: new Date(),
        amount: refundAmt
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'vehicle',
        aggregateId: vehicleId,
        eventType: refundAmt > 0 ? 'vehicle_refunded' : 'vehicle_deleted',
        actorUid: user?.uid || staffId || 'system',
        actorRole: callerRole || 'staff',
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber: vehicleData.plateNumber || vehicleId,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          refundAmount: refundAmt,
          accountingDate: todayYMD,
          accountingPolicy: 'refund_on_refund_date',
          originalCheckoutAt: vehicleData.exitTime?.toDate ? vehicleData.exitTime.toDate().toISOString() : (vehicleData.exitTime || null),
          previousStatus: vehicleData.status,
          previousCost: vehicleData.totalCost || 0,
          staffId: staffId || null,
          staffName: resolvedStaffName,
          operationId,
          operationVersion: nextOperationVersion(vehicleData.operationVersion),
          projectionDelta: refundAmt > 0 ? createVehicleDelta('vehicle_refunded', refundAmt) : createVehicleDelta('vehicle_deleted')
        }
      });
      writeProjectionBucket(t, garageId, todayYMD, operationId, refundAmt > 0 ? createVehicleDelta('vehicle_refunded', refundAmt) : createVehicleDelta('vehicle_deleted'));
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/vehicles/delete', user?.uid);
      }
    });
    return c.json({ success: true });
  } catch (err: any) {
    console.error('[Worker] Delete/refund error:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

workerApp.post('/api/vehicles/delete', requireWorkerAuth, handleVehicleDeleteOrRefund);
workerApp.post('/api/vehicles/refund', requireWorkerAuth, handleVehicleDeleteOrRefund);

// Route 5: GET /api/vehicles/inside
workerApp.get('/api/vehicles/inside', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const garageId = c.req.query('garageId') || user?.garageId || (user?.role === 'garage' ? user?.entityId : null);

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }
    const isAdmin = user?.role === 'admin';
    const isGarageScoped = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);

    if (!isAdmin && !isGarageScoped) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const snap = await adminDb.collection(`garages/${garageId}/vehicles`)
      .where('status', '==', 'inside')
      .get();

    const vehicles = snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => safeDateMillis(b.entryTime) - safeDateMillis(a.entryTime));

    return c.json({
      success: true,
      vehicles,
      count: vehicles.length
    });
  } catch (err: any) {
    console.error('[Worker] Error listing inside vehicles:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 6: GET /api/vehicles/history
workerApp.get('/api/vehicles/history', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const garageId = c.req.query('garageId') || user?.garageId || (user?.role === 'garage' ? user?.entityId : null);

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }
    const isAdmin = user?.role === 'admin';
    const isGarageScoped = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);

    if (!isAdmin && !isGarageScoped) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const dateQuery = c.req.query('date') || new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const limitQuery = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));

    const snap = await adminDb.collection('activity_logs')
      .where('garageId', '==', garageId)
      .limit(limitQuery)
      .get();

    const logs = snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .filter((log: any) => {
        if (!log.timestamp) return false;
        const d = new Date(safeDateMillis(log.timestamp));
        const cairoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        return cairoDate === dateQuery;
      })
      .sort((a: any, b: any) => safeDateMillis(b.timestamp) - safeDateMillis(a.timestamp));

    return c.json({
      success: true,
      logs,
      count: logs.length
    });
  } catch (err: any) {
    console.error('[Worker] Error fetching vehicle history:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// 8. Subscriber Lifecycle Management (CF6)

// Route 1: POST /api/subscribers/add
workerApp.post('/api/subscribers/add', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberData } = body;
    if (!garageId || !subscriberData || !adminDb) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const dates = validateDateRange(subscriberData.startDate, subscriberData.endDate);
    const { plateNumber, plateRaw } = validatePlate(subscriberData.plateNumberRaw || subscriberData.plateNumber);
    const { costUnits: _costUnits, id: _id, createdAt: _createdAt, plateNumber: _clientPlate, plateNumberRaw: _clientPlateRaw, ...subscriberFields } = subscriberData;
    const subscriberCollection = adminDb.collection(`garages/${validatedGarageId}/subscribers`);
    const subscriberId = `plate_${Buffer.from(plateRaw).toString('base64url')}`;
    const docRef = subscriberCollection.doc(subscriberId);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberData: { ...subscriberFields, plateNumber, plateNumberRaw: plateRaw, ...dates } });
    let resultData: { id: string } = { id: subscriberId };

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/add', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || resultData;
          return;
        }
      }
      const deterministicSnap = await t.get(docRef);
      const legacyMatches = await t.get(subscriberCollection.where('plateNumberRaw', '==', plateRaw).limit(1));
      if (deterministicSnap.exists || !legacyMatches.empty) {
        throw new Error('SUBSCRIBER_ALREADY_EXISTS');
      }
      const decision = decideSubscriberAdd(null, addRequestToCommand(subscriberData, { plateNumber, plateRaw }, dates));
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      t.set(docRef, {
        ...subscriberFields,
        plateNumber,
        plateNumberRaw: plateRaw,
        ...dates,
        garageId: validatedGarageId,
        id: docRef.id,
        createdAt: new Date()
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_created',
        actorUid: user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber,
          plateNumberRaw: plateRaw,
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/subscribers/add', user?.uid, requestFingerprint);
      }
    });

    return c.json({ success: true, id: resultData.id });
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in add:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 2: POST /api/subscribers/renew
workerApp.post('/api/subscribers/renew', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberId, newDates } = body;
    if (!garageId || !subscriberId || !newDates || !adminDb) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const dates = validateDateRange(newDates.startDate, newDates.endDate);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const subscriberRef = adminDb.collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberId, newDates: dates });

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/renew', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) return;
      }
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      const currentState = subscriberDocumentToState(currentSnap.data() || {});
      const decision = decideSubscriberRenew(currentState, dates);
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      t.update(subscriberRef, {
        startDate: decision.value.state?.startDate,
        endDate: decision.value.state?.endDate
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_renewed',
        actorUid: user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/renew', user?.uid, requestFingerprint);
      }
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in renew:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 3: POST /api/subscribers/update
workerApp.post('/api/subscribers/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberId } = body;
    const subscriberData = body.subscriberData || body.updates || {};
    if (!garageId || !subscriberId || !subscriberData || !adminDb) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const subscriberRef = adminDb.collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberId, subscriberData });

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/update', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) return;
      }
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      const currentData = currentSnap.data() || {};
      if (subscriberData.plateNumber !== undefined || subscriberData.plateNumberRaw !== undefined) {
        const requestedPlate = validatePlate(subscriberData.plateNumberRaw || subscriberData.plateNumber);
        const currentPlate = validatePlate(currentData.plateNumberRaw || currentData.plateNumber);
        if (requestedPlate.plateRaw !== currentPlate.plateRaw) {
          throw new Error('SUBSCRIBER_PLATE_IMMUTABLE');
        }
      }
      const mergedData = { ...currentData, ...subscriberData };
      const dates = validateDateRange(mergedData.startDate, mergedData.endDate);
      const currentState = subscriberDocumentToState(currentData);
      const decision = decideSubscriberUpdate(currentState, updateRequestToCommand(mergedData, currentState, dates));
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      t.update(subscriberRef, transitionToFirestoreUpdate(decision.value));
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_updated',
        actorUid: user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/update', user?.uid, requestFingerprint);
      }
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in update:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 4: POST /api/subscribers/delete
workerApp.post('/api/subscribers/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberId } = body;
    if (!garageId || !subscriberId || !adminDb) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const subscriberRef = adminDb.collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberId });

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/delete', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) return;
      }
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      const decision = decideSubscriberDelete(subscriberDocumentToState(currentSnap.data() || {}));
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      t.delete(subscriberRef);
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_deleted',
        actorUid: user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {}
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/delete', user?.uid, requestFingerprint);
      }
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in delete:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// 9. Financial Transactions, Recharge Requests, Delegate Commissions & Reporting (CF7)

// Handler 1: Create Recharge Request (POST /api/recharge-requests/create & POST /api/recharge-requests)
const handleCreateRechargeRequest = async (c: any) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId, packageId, amount, requestType, externalReference, notes } = body;
    if (!garageId || !adminDb) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);

    const reqRef = adminDb.collection('recharge_requests').doc();
    const requestId = reqRef.id;

    const requestData: Record<string, any> = {
      requestId,
      garageId: validatedGarageId,
      packageId: packageId || null,
      amount: amount !== undefined ? Number(amount) : null,
      requestType: requestType || 'package_purchase',
      externalReference: externalReference || null,
      notes: notes || null,
      status: 'pending',
      requestedByUid: user?.uid || 'system',
      requestedByRole: user?.role || 'garage',
      createdAt: new Date()
    };

    if (user?.role === 'delegate') {
      requestData.delegateId = user.entityId || user.uid;
      requestData.delegateName = user.displayName || 'مندوب';
    }

    await reqRef.set(requestData);

    return c.json({ success: true, id: requestId, data: requestData });
  } catch (err: any) {
    console.error('[Worker] Error creating recharge request:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
};

workerApp.post('/api/recharge-requests/create', requireWorkerAuth, handleCreateRechargeRequest);
workerApp.post('/api/recharge-requests', requireWorkerAuth, handleCreateRechargeRequest);

// Handler 2: Process/Approve Recharge Request (POST /api/recharge-requests/process & POST /api/transactions/approve-recharge-request)
const handleApproveRechargeRequest = async (c: any) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
  }
  const callerUid = user?.uid;
  try {
    const body = await c.req.json().catch(() => ({}));
    const reqId = validateId(body.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const requestRef = adminDb.doc(`recharge_requests/${reqId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const requestData = requestSnap.data() || {};
      const requestFingerprint = createRequestFingerprint({
        requestId: reqId,
        garageId: requestData.garageId || null,
        requestType: requestData.requestType || null,
        amount: requestData.amount ?? requestData.revenueAmount ?? requestData.price ?? null,
        packageId: requestData.packageId || null,
        durationDays: requestData.durationDays ?? requestData.vehiclesCount ?? null
      });

      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }
      if (requestData.status && requestData.status !== 'pending') {
        throw new Error('REQUEST_ALREADY_PROCESSED');
      }

      const targetGarageId = validateId(requestData.garageId, 'garageId', true);
      const garageRef = adminDb.doc(`garages/${targetGarageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) {
        throw new Error('GARAGE_NOT_FOUND');
      }

      const garageData = garageSnap.data() || {};

      if (requestData.requestType === 'balance_topup') {
        const amount = validateNumber(requestData.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true });
        const creditDecision = decideManualCredit({ amount, previousBalance: Number(garageData.balance || 0) });
        if (creditDecision.ok === false) throw new Error(creditDecision.error);
        const { previousBalance, newBalance } = creditDecision.value;

        t.set(garageRef, { balance: newBalance }, { merge: true });
        t.set(requestRef, {
          status: 'approved',
          amount,
          revenueAmount: amount,
          resolvedAt: new Date()
        }, { merge: true });

        const logRef = adminDb.collection('activity_logs').doc();
        t.set(logRef, {
          garageId: targetGarageId,
          garageName: garageData.name || '',
          staffId: callerUid || 'admin',
          staffName: 'مدير النظام (Admin)',
          actionType: 'balance_topup',
          plateNumber: `اعتماد شحن رصيد (${amount} ج.م)`,
          timestamp: new Date(),
          amount,
          details: { action: 'approved_balance_topup', requestId: reqId, previousBalance, newBalance }
        });

        recordDomainEventInTransaction(t, adminDb, {
          garageId: targetGarageId,
          aggregateType: 'wallet',
          aggregateId: reqId,
          eventType: 'wallet_topup_approved',
          actorUid: callerUid || 'system',
          actorRole: 'admin',
          idempotencyKey: idempotencyKey || undefined,
          payload: { requestId: reqId, amount, previousBalance, newBalance }
        });

        resultData = { requestId: reqId, status: 'approved', amount, previousBalance, newBalance };
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
        return;
      }

      const settingsSnap = await t.get(adminDb.doc('system_config/global'));
      const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};
      const subscriberFlatFee = systemConfig?.subscriberFlatFee !== undefined
        ? Math.max(0, Number(systemConfig.subscriberFlatFee))
        : (systemConfig?.monthlySubscribersFlatFee !== undefined ? Number(systemConfig.monthlySubscribersFlatFee) : 500);

      const referredByDelegate = Boolean(garageData.createdByDelegateId || garageData.referrerId);
      const delegateReferrerId = garageData.createdByDelegateId || garageData.referrerId || null;

      let durationDays = Number(requestData.durationDays || requestData.vehiclesCount || 30);
      let basePrice = Number(requestData.revenueAmount !== undefined ? requestData.revenueAmount : (requestData.price || 0));
      let pkgName = String(requestData.packageName || '');
      let packageDiscountAmount = 0;
      let isUnlimitedPkg = false;
      let effCapacity = 40;

      if (requestData.packageId) {
        const pkgRef = adminDb.doc(`packages/${requestData.packageId}`);
        const pkgSnap = await t.get(pkgRef);
        if (pkgSnap.exists) {
          const pData = pkgSnap.data() || {};
          const validatedPackage = validatePackageCatalogRecord(pData, requestData.packageId);
          basePrice = validatedPackage.basePrice;
          durationDays = validatedPackage.durationDays;
          packageDiscountAmount = validatedPackage.discountAmount;
          pkgName = validatedPackage.name;
          effCapacity = validatedPackage.dailyCapacity;
          isUnlimitedPkg = validatedPackage.isUnlimited;
        } else if (requestData.requestType !== 'balance_topup') {
          throw new Error('PACKAGE_NOT_FOUND');
        }
      } else if (requestData.requestType !== 'balance_topup') {
        throw new Error('PACKAGE_NOT_FOUND');
      }

      const targetDelegateId = delegateReferrerId || requestData.delegateId || null;
      let delegateRef: any = null;
      let delegateSnap: any = null;
      if (targetDelegateId) {
        delegateRef = adminDb.doc(`delegates/${targetDelegateId}`);
        delegateSnap = await t.get(delegateRef);
      }

      let commission = 0;
      if (referredByDelegate && targetDelegateId) {
        const currentMonthKey = new Date().toISOString().slice(0, 7);
        const monthlyStatsRef = adminDb.doc(`garage_monthly_stats/${targetGarageId}_${currentMonthKey}`);
        const monthlyStatsSnap = await t.get(monthlyStatsRef);
        const monthlyStatsData = monthlyStatsSnap.exists ? monthlyStatsSnap.data() : {};

        const prevDaysPurchased = Number(monthlyStatsData.totalDaysPurchased || 0);
        const newDaysPurchased = prevDaysPurchased + durationDays;
        const alreadyPaid = Boolean(monthlyStatsData.paid100EgpCommission);

        if (!alreadyPaid && (durationDays >= 10 || newDaysPurchased >= 10)) {
          commission = 100;
        }

        t.set(monthlyStatsRef, {
          garageId: targetGarageId,
          delegateId: targetDelegateId,
          monthKey: currentMonthKey,
          totalDaysPurchased: newDaysPurchased,
          paid100EgpCommission: alreadyPaid || commission > 0,
          updatedAt: new Date()
        }, { merge: true });
      }

      const effectiveOriginalRevenue = basePrice;
      const discountAmount = packageDiscountAmount;
      let effectiveRevenue = Math.max(0, basePrice - discountAmount);
      if (garageData.hasMonthlySubscribers === true) {
        effectiveRevenue += subscriberFlatFee;
      }

      let baseDate = new Date();
      const currentExpiry = garageData.balanceExpiry;
      if (currentExpiry) {
        const expDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
        if (!isNaN(expDate.getTime()) && expDate.getTime() > baseDate.getTime()) {
          baseDate = expDate;
        }
      }
      baseDate.setDate(baseDate.getDate() + durationDays);

      t.set(garageRef, {
        balanceExpiry: baseDate,
        dailyCapacity: effCapacity,
        activePackageName: pkgName || requestData.packageName || 'الباقة',
        packageName: pkgName || requestData.packageName || 'الباقة',
        billingModel: 'subscription',
        isLocked: false,
        isTrial: false,
        totalAdminRevenue: (garageData.totalAdminRevenue || 0) + effectiveRevenue,
        lastRechargeDate: new Date(),
        lastRechargeAmount: effectiveRevenue,
        lastRechargePackageName: requestData.packageName || null,
        unlimitedFairUse: isUnlimitedPkg ? initializeFairUse(durationDays, pkgName || requestData.packageName || '') : null
      }, { merge: true });

      t.set(requestRef, {
        status: 'approved',
        commission,
        referrerId: delegateReferrerId,
        amount: effectiveRevenue,
        revenueAmount: effectiveRevenue,
        originalRevenueAmount: effectiveOriginalRevenue,
        resolvedAt: new Date()
      }, { merge: true });

      if (delegateRef && delegateSnap && delegateSnap.exists) {
        const delData = delegateSnap.data() || {};
        t.set(delegateRef, {
          totalRechargedAmount: (delData.totalRechargedAmount || 0) + effectiveRevenue,
          totalCommissionEarned: (delData.totalCommissionEarned || 0) + commission
        }, { merge: true });
      }

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId: targetGarageId,
        garageName: requestData.garageName || garageData.name || '',
        staffId: delegateReferrerId || requestData.delegateId || null,
        staffName: requestData.delegateName || null,
        actionType: 'recharge',
        plateNumber: `شحن ${requestData.packageName || 'الباقة'} (${durationDays} يوم)`,
        timestamp: new Date(),
        amount: effectiveRevenue,
        packageId: requestData.packageId || null
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId: targetGarageId,
        aggregateType: 'recharge',
        aggregateId: reqId,
        eventType: 'recharge_approved',
        actorUid: callerUid || 'system',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        payload: { requestId: reqId, amount: effectiveRevenue, originalAmount: effectiveOriginalRevenue, durationDays, packageId: requestData.packageId || null, delegateId: targetDelegateId, commission }
      });
      if (commission > 0 && targetDelegateId) {
        recordDomainEventInTransaction(t, adminDb, {
          garageId: 'global',
          aggregateType: 'delegate',
          aggregateId: targetDelegateId,
          eventType: 'commission_earned',
          actorUid: callerUid || 'system',
          actorRole: 'admin',
          idempotencyKey: idempotencyKey || undefined,
          eventCollectionPath: `delegates/${targetDelegateId}/events`,
          payload: { delegateId: targetDelegateId, commissionAmount: commission, sourceRechargeId: reqId, earnedAt: new Date().toISOString() }
        });
      }

      resultData = { requestId: reqId, status: 'approved', newExpiry: baseDate.toISOString(), revenue: effectiveRevenue, commission };
      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
    });

    return c.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Worker] Error in approve recharge request:', error);
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

workerApp.post('/api/recharge-requests/process', requireWorkerAuth, handleApproveRechargeRequest);
workerApp.post('/api/transactions/approve-recharge-request', requireWorkerAuth, handleApproveRechargeRequest);

// Handler 3: Reject Recharge Request (POST /api/recharge-requests/reject & POST /api/transactions/reject-recharge-request)
const handleRejectRechargeRequest = async (c: any) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
  }
  const callerUid = user?.uid;
  try {
    const body = await c.req.json().catch(() => ({}));
    const requestId = validateId(body.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    await adminDb.runTransaction(async (t: any) => {
      const requestRef = adminDb.doc(`recharge_requests/${requestId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) throw new Error('REQUEST_NOT_FOUND');

      const requestData = requestSnap.data() || {};
      const requestFingerprint = createRequestFingerprint({ requestId, garageId: requestData.garageId || null });
      const { isDuplicate } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/reject-recharge-request', callerUid, requestFingerprint);
      if (isDuplicate) return;

      if (requestData.status && requestData.status !== 'pending') {
        throw new Error('REQUEST_ALREADY_PROCESSED');
      }

      t.set(requestRef, { status: 'rejected', resolvedAt: new Date() }, { merge: true });

      recordDomainEventInTransaction(t, adminDb, {
        garageId: validateId(requestData.garageId, 'garageId', true),
        aggregateType: 'recharge',
        aggregateId: requestId,
        eventType: 'recharge_rejected',
        actorUid: callerUid || 'system',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        payload: { requestId, rejectedAt: new Date().toISOString() }
      });

      storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/transactions/reject-recharge-request', callerUid, requestFingerprint);
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Worker] Error in reject recharge request:', error);
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

workerApp.post('/api/recharge-requests/reject', requireWorkerAuth, handleRejectRechargeRequest);
workerApp.post('/api/transactions/reject-recharge-request', requireWorkerAuth, handleRejectRechargeRequest);

// Handler 4 & 5: Query Recharge Requests (GET /api/recharge-requests & GET /api/recharge-requests/my)
workerApp.get('/api/recharge-requests', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!['admin', 'supervisor'].includes(user?.role || '')) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const snap = await adminDb.collection('recharge_requests').get();
    const requests = snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => safeDateMillis(b.createdAt) - safeDateMillis(a.createdAt));

    return c.json({ success: true, requests });
  } catch (err: any) {
    console.error('[Worker] Error fetching recharge requests:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.get('/api/recharge-requests/my', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const garageId = user?.garageId || user?.entityId;
    const delegateId = user?.role === 'delegate' ? (user?.entityId || user?.uid) : null;

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let query: any;
    if (delegateId) {
      query = adminDb.collection('recharge_requests').where('delegateId', '==', delegateId);
    } else if (garageId) {
      query = adminDb.collection('recharge_requests').where('garageId', '==', garageId);
    } else {
      return c.json({ success: true, requests: [] });
    }

    const snap = await query.get();
    const requests = snap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => safeDateMillis(b.createdAt) - safeDateMillis(a.createdAt));

    return c.json({ success: true, requests });
  } catch (err: any) {
    console.error('[Worker] Error fetching my recharge requests:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Handler 6: Direct Balance Top-Up (POST /api/transactions/admin-topup-balance)
workerApp.post('/api/transactions/admin-topup-balance', requireWorkerAuth, async (c) => {
  const user = c.get('user');
  if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
  const callerUid = user?.uid;
  try {
    const body = await c.req.json().catch(() => ({}));
    const garageId = validateId(body.garageId, 'garageId', true);
    const numAmount = validateNumber(body.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true });
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const requestFingerprint = createRequestFingerprint({ garageId, amount: numAmount });
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/admin-topup-balance', callerUid, requestFingerprint);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');

      const garageData = garageSnap.data() || {};
      const creditDecision = decideManualCredit({ amount: numAmount, previousBalance: Number(garageData.balance || 0) });
      if (creditDecision.ok === false) throw new Error(creditDecision.error);
      const { previousBalance, newBalance } = creditDecision.value;

      t.set(garageRef, {
        balance: newBalance,
        totalAdminRevenue: (garageData.totalAdminRevenue || 0) + numAmount,
        lastRechargeDate: new Date(),
        lastRechargeAmount: numAmount,
        lastRechargePackageName: `شحن رصيد مباشر (${numAmount} ج.م)`
      }, { merge: true });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: callerUid || 'admin',
        staffName: 'مدير النظام (Admin)',
        actionType: 'balance_topup',
        plateNumber: `شحن رصيد مباشر (${numAmount} ج.م)`,
        timestamp: new Date(),
        amount: numAmount
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'wallet',
        aggregateId: garageId,
        eventType: 'wallet_topup_approved',
        actorUid: callerUid || 'admin',
        actorRole: 'admin',
        idempotencyKey,
        payload: { amount: numAmount, previousBalance, newBalance, source: 'admin_direct_topup' }
      });

      resultData = { garageId, newBalance, addedAmount: numAmount };
      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/admin-topup-balance', callerUid, requestFingerprint);
    });

    return c.json({ success: true, data: resultData });
  } catch (err: any) {
    console.error('[Worker] Error in admin balance top-up:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Handler 7: Delegate Commission Earnings & Dashboard (GET /api/delegate/commission-earnings & GET /api/delegates/dashboard)
const handleDelegateDashboard = async (c: any) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'delegate' || !user.entityId || !adminDb) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }

    const delegateId = user.entityId;
    const delegateRef = adminDb.collection('delegates').doc(delegateId);
    const [delegateSnap, createdGaragesSnap, referredGaragesSnap, requestsSnap] = await Promise.all([
      delegateRef.get(),
      adminDb.collection('garages').where('createdByDelegateId', '==', delegateId).get(),
      adminDb.collection('garages').where('referrerId', '==', delegateId).get(),
      adminDb.collection('recharge_requests').where('delegateId', '==', delegateId).get()
    ]);

    if (!delegateSnap.exists) {
      return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    }

    const garagesById = new Map<string, any>();
    for (const snapshot of [createdGaragesSnap, referredGaragesSnap]) {
      for (const garage of snapshot.docs) garagesById.set(garage.id, sanitizeDelegateDoc({ id: garage.id, ...garage.data() }));
    }

    const requests = requestsSnap.docs
      .map((reqDoc: any) => ({ id: reqDoc.id, ...reqDoc.data() }))
      .sort((a: any, b: any) => safeDateMillis(b.createdAt) - safeDateMillis(a.createdAt));

    return c.json({
      success: true,
      delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
      garages: Array.from(garagesById.values()),
      requests
    });
  } catch (err: any) {
    console.error('[Worker Delegate] Error loading dashboard:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
};

workerApp.get('/api/delegate/commission-earnings', requireWorkerAuth, handleDelegateDashboard);
workerApp.get('/api/delegates/dashboard', requireWorkerAuth, handleDelegateDashboard);

// Handler 8: Settle Delegate Commission / Withdrawal (POST /api/delegate/withdraw-commission & POST /api/delegates/settle-account)
const handleSettleDelegateAccount = async (c: any) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const id = body.id || body.delegateId;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestFingerprint = createRequestFingerprint({ id });
    const delRef = adminDb.collection('delegates').doc(id);
    const now = new Date();
    let previousTotal = 0;
    let settlementId = '';
    let duplicateResult: any = null;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/delegates/settle-account', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          duplicateResult = duplicate.cachedResult;
          return;
        }
      }
      const snap = await t.get(delRef);
      if (!snap.exists) throw new Error('DELEGATE_NOT_FOUND');
      const data = snap.data() || {};
      previousTotal = Number(data.totalRechargedAmount || 0);
      const settlementRef = adminDb.collection('settlements').doc();
      settlementId = settlementRef.id;
      t.set(settlementRef, {
        settlementId,
        delegateId: id,
        cutoffTime: now,
        previousCycleTotal: previousTotal,
        settledByUid: user?.uid || 'admin',
        settledAt: now,
        idempotencyKey: idempotencyKey || null,
        createdAt: now
      });
      t.update(delRef, {
        lastSettledAt: now,
        totalRechargedAmount: 0,
        updatedAt: now
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId: 'global',
        aggregateType: 'delegate',
        aggregateId: id,
        eventType: 'delegate_settled',
        actorUid: user?.uid || 'admin',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        eventCollectionPath: `delegates/${id}/events`,
        payload: {
          delegateId: id,
          settlementId,
          previousRechargedAmount: previousTotal,
          settledAt: now.toISOString()
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t,
          idempotencyKey,
          { success: true, settlementId, settledAt: now.toISOString(), previousRechargedAmount: previousTotal },
          '/api/delegates/settle-account',
          user?.uid,
          requestFingerprint
        );
      }
    });

    if (duplicateResult) return c.json(duplicateResult);
    return c.json({ success: true, settlementId, settledAt: now.toISOString(), previousRechargedAmount: previousTotal });
  } catch (err: any) {
    console.error('[Worker Delegate] Error settling account:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
};

workerApp.post('/api/delegate/withdraw-commission', requireWorkerAuth, handleSettleDelegateAccount);
workerApp.post('/api/delegates/settle-account', requireWorkerAuth, handleSettleDelegateAccount);

// Handler 9: Financial Summary Report (GET /api/financial-summary & GET /api/reports/financial)
const handleFinancialSummaryReport = async (c: any) => {
  try {
    const user = c.get('user');
    if (!canViewFinancialReport(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const start = c.req.query('start');
    const end = c.req.query('end');
    const delegateId = c.req.query('delegateId') ? validateId(c.req.query('delegateId'), 'delegateId', true) : undefined;

    if (start && end && new Date(start) >= new Date(end)) {
      return c.json({ success: false, error: 'START_MUST_PRECEDE_END' }, 400);
    }

    const [eventsSnap, settlementsSnap] = await Promise.all([
      adminDb.collectionGroup('events').get(),
      adminDb.collection('settlements').get()
    ]);
    const events = eventsSnap.docs.map((doc: any) => doc.data() || {});
    const settlements = settlementsSnap.docs.map((doc: any) => doc.data() || {});
    const report = calculateFinancialReport(events, settlements, { start, end, delegateId });

    return c.json({
      success: true,
      data: {
        report,
        filters: { start: start || null, end: end || null, delegateId: delegateId || null },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Worker Reports] Error generating financial report:', err);
    return c.json({ success: false, error: err?.message || 'REPORT_GENERATION_FAILED' }, 500);
  }
};

workerApp.get('/api/financial-summary', requireWorkerAuth, handleFinancialSummaryReport);
workerApp.get('/api/reports/financial', requireWorkerAuth, handleFinancialSummaryReport);

// 10. Garage Management & System Hardening (CF8)

// Handler 1: Create Garage (POST /api/garages/create)
workerApp.post('/api/garages/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role;
    const callerUid = user?.uid;
    const callerName = user?.displayName || '';

    if (!canSubmitGarageApplication(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Creation not permitted for role' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const { name, phone, hourlyRate, overnightRate, pin, billingModel, isTrial, trialDays, defaultTrialDays, createdByDelegateId, createdByDelegateName, referrerId, referrerName, referredByGarageId, referredByGarageName } = body;

    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(pin);

    validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    if (callerRole === 'delegate') {
      const delegateEntityId = user?.entityId || callerUid;
      const cairoParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
      const cairoDayStart = new Date(`${cairoParts.year}-${cairoParts.month}-${cairoParts.day}T00:00:00+03:00`);
      const delegateGaragesToday = await adminDb.collection('garages')
        .where('createdByDelegateId', '==', delegateEntityId)
        .where('createdAt', '>=', cairoDayStart)
        .limit(3)
        .get();
      if (delegateGaragesToday.size >= 3) {
        return c.json({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' }, 409);
      }
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const isTrialBool = isTrial === undefined ? true : (isTrial === true || isTrial === 'true');
    const rawTrialDays = trialDays !== undefined ? trialDays : defaultTrialDays;
    const finalTrialDays = rawTrialDays !== undefined
      ? validateNumber(rawTrialDays, 'trialDays', { min: 1, max: 365, required: false })
      : 2;
    const now = new Date();

    let balanceExpiry: Date;
    let finalDailyCapacity: number;
    let activePackageName: string;

    if (isTrialBool) {
      balanceExpiry = new Date(now.getTime() + (finalTrialDays > 0 ? finalTrialDays : 2) * 24 * 60 * 60 * 1000);
      finalDailyCapacity = 100;
      activePackageName = `الباقة التجريبية (${finalTrialDays} يوم)`;
    } else {
      balanceExpiry = new Date(now.getTime() - 1000);
      finalDailyCapacity = 0;
      activePackageName = 'بدون باقة';
    }

    const garageRef = adminDb.collection('garages').doc();
    const garageId = garageRef.id;

    await saveEntityPin('garages', garageId, normPin);

    const garageDoc: Record<string, any> = {
      name: normName.trim(),
      phone: phone ? String(phone).trim() : '',
      hourlyRate: hourlyRate !== undefined ? validateNumber(hourlyRate, 'hourlyRate', { min: 0, max: 10000, required: false }) : 0,
      overnightRate: overnightRate !== undefined ? validateNumber(overnightRate, 'overnightRate', { min: 0, max: 10000, required: false }) : 0,
      billingModel: ['subscription', 'trial'].includes(billingModel) ? billingModel : 'subscription',
      status: (callerRole === 'delegate' || createdByDelegateId || body.isPending) ? 'pending' : 'approved',
      hasMonthlySubscribers: false,
      createdAt: now,
      isTrial: isTrialBool,
      dailyCapacity: finalDailyCapacity,
      activePackageName,
      packageName: activePackageName,
      balanceExpiry,
      balance: 0,
      carsInside: 0,
      carsInsideCount: 0,
      todayCount: 0,
      todayRevenue: 0,
      totalRevenue: 0,
      totalAdminRevenue: 0,
      totalVehiclesOut: 0,
      dailyDeletionCount: 0,
      dailyRefundCount: 0,
      totalReferralRewardDays: 0,
      totalGaragesReferredCount: 0,
      isLocked: false,
      isDeleting: false
    };

    if (callerRole === 'delegate') {
      const delegateEntityId = user?.entityId || callerUid;
      garageDoc.createdByDelegateId = delegateEntityId;
      garageDoc.createdByDelegateName = createdByDelegateName || callerName || 'المندوب';
      garageDoc.referrerId = delegateEntityId;
      garageDoc.referrerName = referrerName || createdByDelegateName || callerName || 'المندوب';
    } else if (createdByDelegateId) {
      garageDoc.createdByDelegateId = createdByDelegateId;
      garageDoc.createdByDelegateName = createdByDelegateName || 'المندوب';
      garageDoc.referrerId = referrerId || createdByDelegateId;
      garageDoc.referrerName = referrerName || createdByDelegateName || 'المندوب';
    }

    if (referredByGarageId) {
      garageDoc.referredByGarageId = referredByGarageId;
      garageDoc.referredByGarageName = referredByGarageName || '';
    }

    await garageRef.set(garageDoc);

    const logRef = adminDb.collection('activity_logs').doc();
    await logRef.set({
      garageId,
      garageName: garageDoc.name,
      staffId: callerUid || null,
      staffName: callerName || (isTrialBool ? 'النظام (تفعيل تجريبي)' : 'الإدارة (إنشاء جراج)'),
      actionType: isTrialBool ? 'recharge' : 'create',
      plateNumber: isTrialBool ? `تفعيل الباقة التجريبية (${finalTrialDays} يوم)` : `إنشاء حساب جراج جديد (بدون باقة)`,
      timestamp: now,
      amount: 0
    });

    return c.json({ success: true, id: garageId });
  } catch (err: any) {
    console.error('[Worker Garage] Error creating garage:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Handler 2: Update Garage (POST /api/garages/update)
workerApp.post('/api/garages/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const { id, ...data } = body;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const updates: Record<string, any> = { updatedAt: new Date() };
    const allowedKeys = [
      'name', 'phone', 'hourlyRate', 'overnightRate', 'monthlySubscriptionFee', 
      'billingModel', 'commissionPerVehicle', 'status', 'isLocked', 'lockReason', 'isSuspended', 'isMaintenanceMode', 
      'maintenanceMessage', 'warningDaysThreshold', 'assignedDelegateId', 'currentSessionId',
      'hasMonthlySubscribers', 'checkInSound', 'checkOutSound', 'ownerName', 'dailyCapacity',
      'shimmerColor', 'activePackageName', 'trialDecision', 'trialDecisionAt'
    ];
    for (const key of allowedKeys) {
      if (key in data && data[key] !== undefined) {
        updates[key] = data[key];
      }
    }

    await adminDb.collection('garages').doc(id).update(updates);
    return c.json({ success: true });
  } catch (err: any) {
    console.error('[Worker Garage] Error updating garage:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Handler 3: Delete Garage (POST /api/garages/delete)
workerApp.post('/api/garages/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const garageId = validateId(body.garageId, 'garageId', true);

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const deletionJobRef = adminDb.doc(`garage_deletion_jobs/${garageId}`);
    const garageRef = adminDb.doc(`garages/${garageId}`);
    const [garageSnap, deletionJobSnap] = await Promise.all([garageRef.get(), deletionJobRef.get()]);
    const garageData = garageSnap.exists ? garageSnap.data() || {} : {};
    const deletionDecision = decideGarageDeletion(
      { callerRole: user.role, garageId },
      garageDocumentToDeletionState(garageSnap.exists ? garageData : null),
      deletionJobDocumentToState(deletionJobSnap.exists ? deletionJobSnap.data() || {} : null)
    );
    if (deletionDecision.ok === false) {
      if (deletionDecision.error === 'GARAGE_NOT_FOUND') {
        return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
      }
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (deletionDecision.value.kind === 'already_deleted') {
      return c.json({ success: true, alreadyDeleted: true });
    }

    await garageRef.set({
      isDeleting: true,
      deletionStartedAt: new Date(),
      deletionStartedBy: user?.uid || null
    }, { merge: true });

    await deletionJobRef.set({
      garageId,
      status: 'running',
      updatedAt: new Date(),
      startedAt: new Date(),
      startedBy: user?.uid || null
    }, { merge: true });

    return c.json({ success: true, deletionStarted: true });
  } catch (err: any) {
    console.error('[Worker Garage] Error deleting garage:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Handler 4 & 5: Query Garages (GET /api/garages & GET /api/garages/:id)
workerApp.get('/api/garages', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!['admin', 'supervisor', 'delegate'].includes(user?.role || '')) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let query: any = adminDb.collection('garages');
    if (user?.role === 'delegate') {
      const delegateId = user.entityId || user.uid;
      query = query.where('createdByDelegateId', '==', delegateId);
    }

    const snap = await query.get();
    const garages = snap.docs.map((docSnap: any) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    return c.json({ success: true, garages });
  } catch (err: any) {
    console.error('[Worker Garage] Error listing garages:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.get('/api/garages/:id/dashboard-summary', requireWorkerAuth, async (c) => {
  const startedAt = Date.now();
  try {
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const user = c.get('user');
    if (!decideGarageScope(user, garageId)) return c.json({ success: false, error: 'FORBIDDEN: Garage summary scope required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [bucketSnap, garageSnap, summarySnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', today).get(),
      adminDb.doc(`garages/${garageId}`).get(),
      adminDb.doc(`garages/${garageId}/dashboard_summary/current`).get()
    ]);
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
    c.header('Server-Timing', `dashboard-summary;dur=${Date.now() - startedAt}`);
    if (bucketSnap.empty) {
      if (!summarySnap.exists) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_NOT_READY' }, 404);
      const storedSummary = summarySnap.data() || {};
      if (!isFreshDashboardSummary(storedSummary, today)) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
      c.header('X-Summary-Source', 'stored_rebuild');
      return c.json({ success: true, data: { garageId, summary: storedSummary } });
    }
    const summary = {
      ...aggregateProjectionBuckets(bucketSnap.docs.map((doc: any) => doc.data() || {})),
      activeVehicleCount: Number(garageSnap.data()?.carsInside || 0),
      garageId,
      dateId: today,
      rebuiltAt: new Date().toISOString(),
      source: 'live_projection_buckets'
    };
    c.header('X-Summary-Source', 'live_projection_buckets');
    c.header('X-Summary-Bucket-Count', String(bucketSnap.size));
    return c.json({ success: true, data: { garageId, summary, bucketCount: bucketSnap.size } });
  } catch (error: any) {
    console.error('[Worker Garage] Error reading dashboard summary:', error);
    return c.json({ success: false, error: error?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.get('/api/garages/:id', requireWorkerAuth, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const user = c.get('user');
    if (!decideGarageScope(user, id)) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
    }
    const docSnap = await adminDb.doc(`garages/${id}`).get();
    if (!docSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    return c.json({ success: true, garage: { id: docSnap.id, ...docSnap.data() } });
  } catch (err: any) {
    console.error('[Worker Garage] Error fetching garage:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// CF2 Runtime Compatibility Spike Endpoints (Pre-production only, disabled in production)
workerApp.post('/api/test-auth-verify', async (c) => {
  const env = c.env?.ENVIRONMENT || process.env.NODE_ENV || 'production';
  if (env === 'production') {
    return c.json({ success: false, error: 'SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION' }, 403);
  }

  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return c.json({ success: false, error: 'TOKEN_REQUIRED' }, 400);
  }

  if (!adminAuth) {
    return c.json({ success: false, error: 'ADMIN_AUTH_NOT_INITIALIZED' }, 503);
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return c.json({
      success: true,
      uid: decoded.uid,
      email: decoded.email || null,
      role: decoded.role || null,
      runtime: 'cloudflare-worker',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: 'AUTH_VERIFICATION_FAILED',
      message: err?.message || 'Token verification error'
    }, 401);
  }
});

workerApp.get('/api/test-firestore-read', async (c) => {
  const env = c.env?.ENVIRONMENT || process.env.NODE_ENV || 'production';
  if (env === 'production') {
    return c.json({ success: false, error: 'SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION' }, 403);
  }

  if (!adminDb) {
    return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);
  }

  try {
    const docRef = adminDb.collection('_spike_tests').doc('synthetic_doc');
    const snap = await docRef.get();
    return c.json({
      success: true,
      exists: snap.exists,
      data: snap.exists ? snap.data() : null,
      databaseId: c.env?.FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || 'default',
      runtime: 'cloudflare-worker',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: 'FIRESTORE_READ_FAILED',
      message: err?.message || 'Firestore read error'
    }, 500);
  }
});

workerApp.post('/api/test-firestore-write', async (c) => {
  const env = c.env?.ENVIRONMENT || process.env.NODE_ENV || 'production';
  if (env === 'production') {
    return c.json({ success: false, error: 'SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION' }, 403);
  }

  if (!adminDb) {
    return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const testDocId = `spike_${Date.now()}`;
    const testRef = adminDb.collection('_spike_tests').doc(testDocId);

    // Test both direct write and atomic transaction
    await adminDb.runTransaction(async (t: any) => {
      t.set(testRef, {
        synthetic: true,
        testPayload: body?.payload || 'synthetic_spike_value',
        createdAt: new Date(),
        runtime: 'cloudflare-worker'
      });
    });

    return c.json({
      success: true,
      docId: testDocId,
      path: `_spike_tests/${testDocId}`,
      transactionSupported: true,
      runtime: 'cloudflare-worker',
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({
      success: false,
      error: 'FIRESTORE_WRITE_FAILED',
      message: err?.message || 'Firestore write error'
    }, 500);
  }
});

// All production API routes are implemented directly on the Fetch-native Hono app.

export { workerApp };
export default {
  fetch: workerApp.fetch
};
