import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FieldValue } from './firebaseWorkerAdmin';
import { adminDb, adminAuth, initializeFirebaseAdmin } from './firebaseAdmin';
import { isValidBackendOperatorToken } from './backendOperatorToken';
import { withTraceContext } from './operationTrace';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { recordDomainEventInTransaction } from './events';
import { parseMoneyAmount } from './money';
import { calculateVehicleCost, checkPinAvailabilityAcrossAll, saveEntityPin, saveEntityPinInTransaction, deleteEntityPinInTransaction, computeLookupHash, cleanPin, verifyPinMatch, verifyDocMatch, queryAccountWherePin, queryDelegatesWherePhone, getAdminPin, migratePinToHash } from './utils';
import { validateIdempotencyKey, validatePlate, normalizePlateRaw, validateDateRange, validateId, validateNumber, validateNewPin, validateString, isNewPinFormat, sanitizePayload, ValidationError } from './validation';
import { mapDomainErrorToStatus } from './routes/helpers';
import { createOperationId, createVehicleDelta, nextOperationVersion, projectionBucketPath, projectionBucketUpdate, projectionShardCount, ProjectionDelta } from './deltaProjection';
import { decideVehicleCheckIn } from './domain/vehicleCheckIn';
import { garageDocumentToCheckInState, vehicleDocumentToCheckInState } from './adapters/vehicleCheckInAdapter';
import { decideVehicleCheckOut } from './domain/vehicleCheckOut';
import { garageDocumentToCheckOutState, vehicleDocumentToCheckOutState } from './adapters/vehicleCheckOutAdapter';
import { authorizeVehicleGarageScope, canManageGarageScopedData as decideGarageScope, canManageDelegates, canManageStaffForGarage, canUpdateEntityPin, canViewFinancialReport, canSubmitGarageApplication, canRunGarageMaintenance, canInvalidateAllSessions } from './domain/authorization';
import { validatePackageCatalogRecord } from './packageCatalog';
import { awardReferralCredits, debitRegularEntry, debitSubscriberRenewal, grantPaidCredits, grantTrialCredits, materializeCreditLedgerEntry, restoreCredits } from './domain/prepaidCreditLedger';
import { addFinancialReportCreditLedgerEntry, addFinancialReportEvent, addFinancialReportSettlement, createFinancialReportAccumulator, finishFinancialReport } from './financialReporting';
import { aggregateProjectionBuckets, isFreshDashboardSummary, isValidDateKey, normalizeStoredDashboardMoney, reconcileDashboardSummary } from './dashboardSummary';
import { calculateDailyProjection, getCairoDayBounds } from './projections';
import { buildFirestorePage, firestorePageStartAfter, parseFirestorePageRequest } from './firestorePagination';
import { registerReadRoutes } from './readRoutes';
import { registerVehicleRoutes } from './vehicleRoutes';
import { registerSubscriberRoutes } from './subscriberRoutes';
import { registerFinancialRoutes } from './financialRoutes';
import { registerGarageRoutes } from './garageRoutes';
import { sanitizeDelegateDoc } from './workerReadHelpers';
import {
  startGarageDeletionRoute,
  advanceGarageDeletionRoute,
  readGarageDeletionStatusRoute
} from './garageDeletionRoutes';
import { reconcileGarageState } from './domain/garageReconciliation';
import { addActiveSession, hasActiveSession, hashSessionId, removeActiveSession, toSessionSummary } from './auth/sessionMarkers';
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

async function readWorkerFirestorePage(query: any, collection: any, pageRequest: ReturnType<typeof parseFirestorePageRequest>, orderField = 'createdAt') {
  const orderedQuery = query.orderBy(orderField, 'desc').orderBy('__name__', 'desc');
  const afterCursor = firestorePageStartAfter(orderedQuery, collection, pageRequest.cursor);
  const snapshot = await afterCursor.limit(pageRequest.pageSize + 1).get();
  return buildFirestorePage(snapshot.docs, pageRequest, orderField);
}

const workerApp = new Hono<{
  Bindings: {
    ENVIRONMENT?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_DATABASE_ID?: string;
    ALLOWED_ORIGINS?: string;
    BACKEND_OPERATOR_TOKEN?: string;
    SPIKE_DIAGNOSTIC_TOKEN?: string;
    SPIKE_ENVIRONMENT_ALLOWLIST?: string;
    WORKER_VERSION?: string;
    WORKER_COMMIT_SHA?: string;
    PIN_RATE_LIMITER?: PinRateLimiterNamespace;
  };
  Variables: {
    correlationId: string;
    operationId: string;
    user?: WorkerUser;
  };
}>();
export type WorkerApp = typeof workerApp;
let configuredAllowedOrigins = '';

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

function isAllowedWorkerOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/+$/, '');
  const configured = configuredAllowedOrigins.split(',').map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean);
  if (configured.includes(normalized)) return true;
  return new Set(['https://rq-acg.pages.dev']).has(normalized);
}

const FINANCIAL_RATE_LIMIT_MAX_REQUESTS = 30;
const FINANCIAL_RATE_LIMIT_WINDOW_MS = 60_000;

async function consumeWorkerFinancialRateLimit(key: string, now = Date.now(), collection = 'rate_limits'): Promise<boolean> {
  if (!adminDb) throw new Error('ADMIN_SDK_NOT_INITIALIZED');

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fin:${key}`));
  const docId = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const ref = adminDb.doc(`${collection}/${docId}`);

  return adminDb.runTransaction(async (t: any) => {
    const snap = await t.get(ref);
    const data = snap.exists ? snap.data() || {} : null;

    if (!data || now > data.resetAt) {
      t.set(ref, {
        count: 1,
        resetAt: now + FINANCIAL_RATE_LIMIT_WINDOW_MS,
        expiresAt: new Date(now + FINANCIAL_RATE_LIMIT_WINDOW_MS)
      });
      return true;
    }
    if (data.count >= FINANCIAL_RATE_LIMIT_MAX_REQUESTS) return false;

    t.update(ref, { count: data.count + 1 });
    return true;
  });
}

async function enforceWorkerFinancialRateLimit(c: any, next: () => Promise<void>) {
  // If the Admin SDK is unavailable, each protected route retains its existing
  // unavailable-SDK response and cannot perform a business-data write.
  if (!adminDb) return next();

  const user = c.get('user');
  const environment = String(c.env?.ENVIRONMENT || 'production').trim() || 'production';
  const actorKey = user?.uid || c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const key = environment === 'production' ? actorKey : `${environment}:${actorKey}`;
  const collection = environment === 'production' ? 'rate_limits' : `rate_limits_${environment}_v2`;
  try {
    const allowed = await consumeWorkerFinancialRateLimit(key, Date.now(), collection);
    if (!allowed) {
      const correlationId = c.get('correlationId');
      return c.json({
        success: false,
        error: 'TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.',
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        timestamp: new Date().toISOString(),
        ...(correlationId ? { correlationId } : {})
      }, 429);
    }
  } catch (error) {
    console.error(`[Worker Garage] Financial rate limiter unavailable for ${c.req.path}:`, error);
    return c.json({ success: false, error: 'RATE_LIMITER_UNAVAILABLE' }, 503);
  }

  await next();
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

  await withTraceContext({ correlationId, operationId }, next);

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

// Normalize auth/authorization failures in one place so every route uses the
// same machine-readable contract, including older handlers with legacy strings.
workerApp.use('*', async (c, next) => {
  await next();
  const status = c.res.status;
  if (status !== 401 && status !== 403) return;

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await c.res.clone().json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // A legacy plain-text error still receives a stable envelope below.
  }

  const rawError = typeof body.error === 'string'
    ? body.error
    : typeof body.message === 'string'
      ? body.message
      : typeof body.code === 'string'
        ? body.code
        : status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN';
  const explicitCode = typeof body.code === 'string' ? body.code : undefined;
  const messageCode = rawError.match(/^([A-Z][A-Z0-9_]*)(?::|\b)/)?.[1];
  const code = explicitCode || messageCode || (status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN');
  const correlationId = typeof body.correlationId === 'string'
    ? body.correlationId
    : c.get('correlationId');

  const normalizedResponse = c.json({
    ...body,
    success: false,
    error: rawError,
    code,
    statusCode: status,
    ...(correlationId ? { correlationId } : {}),
    timestamp: typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString()
  }, status);
  c.res = normalizedResponse;
  return c.res;
});

// Helper: Worker Authentication Middleware
async function requireWorkerAuth(
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
}

const SPIKE_DIAGNOSTIC_HEADER = 'x-rq-diagnostic-token';
const SPIKE_WRITE_MAX_BODY_BYTES = 2048;
const SPIKE_WRITE_MAX_PAYLOAD_LENGTH = 512;
const SPIKE_MIN_DIAGNOSTIC_TOKEN_LENGTH = 32;

function constantTimeStringEquals(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function authorizeSpikeEndpoint(c: any): Response | null {
  const environment = String(c.env?.ENVIRONMENT ?? '').trim().toLowerCase();
  if (environment === 'production') {
    return c.json({ success: false, error: 'SPIKE_ENDPOINT_DISABLED_IN_PRODUCTION' }, 403);
  }

  const allowedEnvironments = String(c.env?.SPIKE_ENVIRONMENT_ALLOWLIST ?? '')
    .split(',')
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean);
  const expectedToken = String(c.env?.SPIKE_DIAGNOSTIC_TOKEN ?? '');
  if (!environment || !allowedEnvironments.includes(environment) || expectedToken.length < SPIKE_MIN_DIAGNOSTIC_TOKEN_LENGTH) {
    return c.json({ success: false, error: 'SPIKE_ENDPOINT_DISABLED' }, 403);
  }

  const suppliedToken = String(c.req.header(SPIKE_DIAGNOSTIC_HEADER) ?? '').trim();
  if (!suppliedToken) {
    return c.json({ success: false, error: 'DIAGNOSTIC_CREDENTIAL_REQUIRED' }, 401);
  }
  if (!constantTimeStringEquals(suppliedToken, expectedToken)) {
    return c.json({ success: false, error: 'DIAGNOSTIC_CREDENTIAL_INVALID' }, 403);
  }

  return null;
}

// 5. Foundation Routes (Directly wired in Worker)
workerApp.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-worker',
    timestamp: new Date().toISOString(),
    environment: c.env?.ENVIRONMENT || 'production',
    adminSdk: !!(adminDb && adminAuth),
    version: c.env?.WORKER_VERSION || process.env.WORKER_VERSION || '1.0.0',
    commitSha: c.env?.WORKER_COMMIT_SHA || process.env.WORKER_COMMIT_SHA || 'unknown'
  });
});

workerApp.get('/api/version', (c) => {
  return c.json({
    version: c.env?.WORKER_VERSION || process.env.WORKER_VERSION || '1.0.0',
    commitSha: c.env?.WORKER_COMMIT_SHA || process.env.WORKER_COMMIT_SHA || 'unknown',
    environment: c.env?.ENVIRONMENT || 'production',
    runtime: 'cloudflare-worker',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

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

    const entityCollMap: Record<string, string> = { admin: 'admin_settings', delegate: 'delegates', garage: 'garages', staff: 'staff' };
    const secCollMap: Record<string, string> = { admin: 'admin_sessions', delegate: 'delegate_sessions', garage: 'garage_sessions', staff: 'staff_sessions' };
    const entityColl = entityCollMap[match.role];
    const secColl = secCollMap[match.role];
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
    const secCollMap: Record<string, string> = { admin: 'admin_sessions', delegate: 'delegate_sessions', garage: 'garage_sessions', staff: 'staff_sessions' };
    const entityCollMap: Record<string, string> = { admin: 'admin_settings', delegate: 'delegates', garage: 'garages', staff: 'staff' };
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
    if (sessionData.role && sessionData.role !== role) return c.json({ success: false, valid: false, error: 'INVALID_ROLE' });

    const lastActiveValue = sessionData.lastActive;
    const lastActive = lastActiveValue?.toDate ? lastActiveValue.toDate().getTime() : new Date(lastActiveValue || 0).getTime();
    if (!lastActive || Date.now() - lastActive > 24 * 60 * 60 * 1000) {
      await rootRef.set({ isActive: false }, { merge: true });
      return c.json({ success: false, valid: false, error: 'SESSION_EXPIRED' });
    }

    // The security session is the authoritative record for heartbeat checks.
    // Entity snapshots can lag briefly after the atomic claim; rejecting here
    // would send a valid newly signed-in user into a false session-expired loop.
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
      await entityRef.set({ lastActive: new Date() }, { merge: true });
    }
    await rootRef.set({ lastActive: new Date() }, { merge: true });
    await updateSessionIndex(effectiveUid, sessionId, { isActive: true, lastActive: new Date() });
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

function writeProjectionBucket(transaction: any, garageId: string, dateId: string, operationId: string, delta: ProjectionDelta): void {
  if (!adminDb || Object.keys(delta).length === 0) return;
  const configuredRate = Number(process.env.PROJECTION_OPERATIONS_PER_SECOND || 1);
  const shardCount = projectionShardCount(Number.isFinite(configuredRate) ? configuredRate : 1);
  const bucket = projectionBucketUpdate(operationId, dateId, delta, shardCount);
  const bucketRef = adminDb.doc(projectionBucketPath(garageId, dateId, operationId, shardCount));
  const increments = Object.fromEntries(Object.entries(delta).map(([field, value]) => [field, FieldValue.increment(Number(value || 0))]));
  transaction.set(bucketRef, { ...increments, operationId: bucket.operationId, projectionVersion: bucket.projectionVersion, dateId: bucket.dateId, shard: bucket.shard, updatedAt: new Date() }, { merge: true });
}

const MAINTAINED_SUMMARY_VERSION = 1;

function maintainedGarageSummaryRef(garageId: string): any {
  return adminDb?.doc(`garages/${garageId}/maintained_summary/current`);
}

function maintainedGarageDailySummaryRef(garageId: string, dateId: string): any {
  return adminDb?.doc(`garages/${garageId}/maintained_summary/daily_${dateId}`);
}

function maintainedAdminSummaryRef(): any {
  return adminDb?.doc('admin_summary/global');
}

function maintainedSubscriberSummaryRef(): any {
  return adminDb?.doc('subscriber_summary/global');
}

function writeMaintainedSummaryDelta(transaction: any, ref: any, delta: Record<string, number>, metadata: Record<string, any> = {}): void {
  if (!ref) return;
  const increments = Object.fromEntries(Object.entries(delta).map(([field, value]) => [field, FieldValue.increment(Number(value || 0))]));
  transaction.set(ref, {
    schemaVersion: MAINTAINED_SUMMARY_VERSION,
    ...increments,
    ...metadata,
    updatedAt: new Date()
  }, { merge: true });
}

function writeMaintainedGarageDelta(transaction: any, garageId: string, delta: Record<string, number>, metadata: Record<string, any> = {}): void {
  writeMaintainedSummaryDelta(transaction, maintainedGarageSummaryRef(garageId), delta, metadata);
}

function writeMaintainedGarageDailyDelta(transaction: any, garageId: string, dateId: string, delta: Record<string, number>): void {
  writeMaintainedSummaryDelta(transaction, maintainedGarageDailySummaryRef(garageId, dateId), delta, {
    garageId,
    dateId,
    schemaVersion: MAINTAINED_SUMMARY_VERSION
  });
}

function writeMaintainedAdminDelta(transaction: any, delta: Record<string, number>): void {
  writeMaintainedSummaryDelta(transaction, maintainedAdminSummaryRef(), delta, { summaryScope: 'admin' });
}

function writeMaintainedSubscriberDelta(transaction: any, delta: Record<string, number>): void {
  writeMaintainedSummaryDelta(transaction, maintainedSubscriberSummaryRef(), delta, { summaryScope: 'subscribers' });
}

function isUsableMaintainedSummary(value: any, requiredFields: string[] = []): boolean {
  return Boolean(value && value.schemaVersion === MAINTAINED_SUMMARY_VERSION && value.stale !== true && requiredFields.every((field) => Number.isFinite(Number(value[field]))));
}

// 6. Public and read-heavy routes are registered from a focused module.
registerReadRoutes(workerApp, {
  getAdminDb: () => adminDb,
  requireWorkerAuth,
  ValidationError,
  validateNumber,
  mapDomainErrorToStatus,
  maintainedGarageSummaryRef,
  maintainedGarageDailySummaryRef,
  isUsableMaintainedSummary,
  maintainedAdminSummaryRef,
  maintainedSubscriberSummaryRef,
  readWorkerFirestorePage,
  parseFirestorePageRequest,
  maintainedSummaryVersion: MAINTAINED_SUMMARY_VERSION
});

// 7. Vehicle Operations & Operational Flow (CF5)
registerVehicleRoutes(workerApp, {
  getAdminDb: () => adminDb,
  requireWorkerAuth,
  checkIdempotencyInTransaction,
  createRequestFingerprint,
  storeIdempotencyInTransaction,
  recordDomainEventInTransaction,
  parseMoneyAmount,
  calculateVehicleCost,
  validateIdempotencyKey,
  validatePlate,
  normalizePlateRaw,
  mapDomainErrorToStatus,
  createOperationId,
  createVehicleDelta,
  nextOperationVersion,
  decideVehicleCheckIn,
  garageDocumentToCheckInState,
  vehicleDocumentToCheckInState,
  decideVehicleCheckOut,
  garageDocumentToCheckOutState,
  vehicleDocumentToCheckOutState,
  authorizeVehicleGarageScope,
  debitRegularEntry,
  materializeCreditLedgerEntry,
  restoreCredits,
  writeProjectionBucket,
  writeMaintainedGarageDelta,
  writeMaintainedGarageDailyDelta
});
// 8. Subscriber Lifecycle Management (CF6)
registerSubscriberRoutes(workerApp, {
  getAdminDb: () => adminDb,
  requireWorkerAuth,
  decideGarageScope,
  validateId,
  validateDateRange,
  validatePlate,
  validateIdempotencyKey,
  mapDomainErrorToStatus,
  checkIdempotencyInTransaction,
  createRequestFingerprint,
  storeIdempotencyInTransaction,
  recordDomainEventInTransaction,
  decideSubscriberAdd,
  decideSubscriberDelete,
  decideSubscriberRenew,
  decideSubscriberUpdate,
  addRequestToCommand,
  lifecycleErrorToLegacyError,
  subscriberDocumentToState,
  transitionToFirestoreUpdate,
  updateRequestToCommand,
  debitSubscriberRenewal,
  materializeCreditLedgerEntry,
  maintainedGarageSummaryRef,
  writeMaintainedGarageDelta,
  writeMaintainedSubscriberDelta
});
// 9. Financial Transactions, Recharge Requests, Delegate Commissions & Reporting (CF7)
registerFinancialRoutes(workerApp, {
  getAdminDb: () => adminDb,
  requireWorkerAuth,
  enforceWorkerFinancialRateLimit,
  validateId,
  validateIdempotencyKey,
  checkIdempotencyInTransaction,
  createRequestFingerprint,
  storeIdempotencyInTransaction,
  recordDomainEventInTransaction,
  parseFirestorePageRequest,
  readWorkerFirestorePage,
  sanitizeDelegateDoc,
  canViewFinancialReport,
  addFinancialReportCreditLedgerEntry,
  addFinancialReportEvent,
  addFinancialReportSettlement,
  createFinancialReportAccumulator,
  finishFinancialReport
});
// 10. Garage Management & System Hardening (CF8)
registerGarageRoutes(workerApp, {
  getAdminDb: () => adminDb,
  requireWorkerAuth,
  enforceWorkerFinancialRateLimit,
  canSubmitGarageApplication,
  sanitizePayload,
  validateString,
  validateNumber,
  ValidationError,
  validateNewPin,
  validateIdempotencyKey,
  computeLookupHash,
  checkPinAvailabilityAcrossAll,
  createRequestFingerprint,
  checkIdempotencyInTransaction,
  saveEntityPinInTransaction,
  maintainedGarageSummaryRef,
  maintainedAdminSummaryRef,
  MAINTAINED_SUMMARY_VERSION,
  writeMaintainedAdminDelta,
  storeIdempotencyInTransaction,
  mapDomainErrorToStatus,
  parseMoneyAmount,
  parseFirestorePageRequest,
  firestorePageStartAfter,
  buildFirestorePage,
  canRunGarageMaintenance,
  validateId,
  getCairoDayBounds,
  reconcileGarageState,
  isValidDateKey,
  calculateDailyProjection,
  aggregateProjectionBuckets,
  reconcileDashboardSummary,
  decideGarageScope,
  isFreshDashboardSummary,
  normalizeStoredDashboardMoney,
  canManageStaffForGarage,
  deleteEntityPinInTransaction,
  canManageDelegates,
  saveEntityPin,
  canUpdateEntityPin,
  validatePackageCatalogRecord,
  grantPaidCredits,
  grantTrialCredits,
  awardReferralCredits,
  materializeCreditLedgerEntry,
  recordDomainEventInTransaction,
  startGarageDeletionRoute,
  advanceGarageDeletionRoute,
  readGarageDeletionStatusRoute,
});
// Activity Logs Placeholder (Server generated only)
workerApp.post('/api/activity-logs/add', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'SERVER_GENERATED_ONLY' }, 403);
});

// CF2 Runtime Compatibility Spike Endpoints (Pre-production only, disabled in production)
workerApp.post('/api/test-auth-verify', async (c) => {
  const authorizationFailure = authorizeSpikeEndpoint(c);
  if (authorizationFailure) return authorizationFailure;

  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return c.json({ success: false, error: 'TOKEN_REQUIRED' }, 401);
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
  const authorizationFailure = authorizeSpikeEndpoint(c);
  if (authorizationFailure) return authorizationFailure;

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
  const authorizationFailure = authorizeSpikeEndpoint(c);
  if (authorizationFailure) return authorizationFailure;

  if (!adminDb) {
    return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);
  }

  try {
    const contentLengthHeader = c.req.header('content-length');
    if (contentLengthHeader !== undefined) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        return c.json({ success: false, error: 'INVALID_CONTENT_LENGTH' }, 400);
      }
      if (contentLength > SPIKE_WRITE_MAX_BODY_BYTES) {
        return c.json({ success: false, error: 'SPIKE_PAYLOAD_TOO_LARGE' }, 413);
      }
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ success: false, error: 'INVALID_SPIKE_PAYLOAD' }, 400);
    }
    const serializedBody = JSON.stringify(body);
    if (new TextEncoder().encode(serializedBody).byteLength > SPIKE_WRITE_MAX_BODY_BYTES) {
      return c.json({ success: false, error: 'SPIKE_PAYLOAD_TOO_LARGE' }, 413);
    }
    const payload = (body as Record<string, unknown>).payload === undefined
      ? 'synthetic_spike_value'
      : (body as Record<string, unknown>).payload;
    if (typeof payload !== 'string' || payload.length > SPIKE_WRITE_MAX_PAYLOAD_LENGTH) {
      return c.json({ success: false, error: 'INVALID_SPIKE_PAYLOAD' }, 400);
    }

    const testDocId = `spike_${Date.now()}`;
    const testRef = adminDb.collection('_spike_tests').doc(testDocId);

    // Test both direct write and atomic transaction
    await adminDb.runTransaction(async (t: any) => {
      t.set(testRef, {
        synthetic: true,
        testPayload: payload,
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
