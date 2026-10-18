import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FieldValue } from './firebaseWorkerAdmin';
import { adminDb, adminAuth, initializeFirebaseAdmin } from './firebaseAdmin';
import { isValidBackendOperatorToken } from './backendOperatorToken';
import { withTraceContext } from './operationTrace';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { recordDomainEventInTransaction } from './events';
import { parseMoneyAmount } from './money';
import { initializeFairUse, manualAdminExtendFairUse } from './unlimitedFairUse';
import { calculateVehicleCost, checkPinAvailabilityAcrossAll, saveEntityPin, saveEntityPinInTransaction, deleteEntityPinInTransaction, computeLookupHash, cleanPin, verifyPinMatch, verifyDocMatch, queryAccountWherePin, queryDelegatesWherePhone, getAdminPin, migratePinToHash } from './utils';
import { validateIdempotencyKey, validatePlate, normalizePlateRaw, validateDateRange, validateId, validateNumber, validateNewPin, validateString, isNewPinFormat, sanitizePayload, ValidationError } from './validation';
import { mapDomainErrorToStatus } from './routes/helpers';
import { createOperationId, createVehicleDelta, nextOperationVersion, projectionBucketPath, projectionBucketUpdate, projectionShardCount, ProjectionDelta } from './deltaProjection';
import { decideVehicleCheckIn } from './domain/vehicleCheckIn';
import { garageDocumentToCheckInState, vehicleDocumentToCheckInState } from './adapters/vehicleCheckInAdapter';
import { decideVehicleCheckOut } from './domain/vehicleCheckOut';
import { garageDocumentToCheckOutState, vehicleDocumentToCheckOutState } from './adapters/vehicleCheckOutAdapter';
import { authorizeVehicleGarageScope, canManageGarageScopedData as decideGarageScope, canManageDelegates, canManageStaffForGarage, canUpdateEntityPin, canUpdateTrialDecision, canViewFinancialReport, canSubmitGarageApplication, canRunGarageMaintenance, canInvalidateAllSessions } from './domain/authorization';
import { validatePackageCatalogRecord } from './packageCatalog';
import { decideManualCredit } from './domain/manualCredit';
import { awardReferralCredits, debitRegularEntry, debitSubscriberRenewal, grantPaidCredits, materializeCreditLedgerEntry, restoreCredits } from './domain/prepaidCreditLedger';
import { applyReferralReward, decideReferralReward, extendSubscriptionExpiry } from './domain/subscriptionBilling';
import { addFinancialReportCreditLedgerEntry, addFinancialReportEvent, addFinancialReportSettlement, createFinancialReportAccumulator, finishFinancialReport } from './financialReporting';
import { aggregateProjectionBuckets, isFreshDashboardSummary, isValidDateKey, normalizeStoredDashboardMoney, reconcileDashboardSummary } from './dashboardSummary';
import { calculateDailyProjection, getCairoDayBounds } from './projections';
import { buildFirestorePage, firestorePageStartAfter, parseFirestorePageRequest } from './firestorePagination';
import { registerReadRoutes } from './readRoutes';
import { registerVehicleRoutes } from './vehicleRoutes';
import { registerSubscriberRoutes } from './subscriberRoutes';
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
  return new Set([
    'https://rq-acg.pages.dev',
    'https://aistudio.google.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ]).has(normalized);
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

function invalidateMaintainedAdminSummary(transaction: any): void {
  const ref = maintainedAdminSummaryRef();
  if (ref) transaction.set(ref, { schemaVersion: MAINTAINED_SUMMARY_VERSION, summaryScope: 'admin', stale: true, updatedAt: new Date() }, { merge: true });
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

// Handler 1: Create Recharge Request (POST /api/recharge-requests/create & POST /api/recharge-requests)
const handleCreateRechargeRequest = async (c: any) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
  try {
    const user = c.get('user') as WorkerUser | undefined;
    if (user?.role !== 'garage' && user?.role !== 'delegate') {
      return c.json({ success: false, error: 'FORBIDDEN: Garage owner or delegate required' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['garageId', 'packageId', 'requestType', 'amount', 'couponCode', 'idempotencyKey'], false);
    const validatedGarageId = validateId(sanitized.garageId, 'garageId', true);
    const rawRequestType = sanitized.requestType === undefined
      ? 'subscription'
      : validateString(sanitized.requestType, 'requestType', { required: true, allowEmptyString: false });
    const requestType = rawRequestType === 'package_purchase' ? 'subscription' : rawRequestType;
    if (requestType !== 'subscription' && requestType !== 'balance_topup') {
      throw new ValidationError('Invalid requestType', 'INVALID_REQUEST_TYPE', 400);
    }

    const packageId = sanitized.packageId === undefined || sanitized.packageId === null || sanitized.packageId === ''
      ? null
      : validateId(sanitized.packageId, 'packageId', true);
    if (requestType === 'subscription' && !packageId) {
      return c.json({ success: false, error: 'PACKAGE_REQUIRED' }, 400);
    }
    const couponCode = validateString(sanitized.couponCode, 'couponCode', { max: 256 }) || null;
    const amount = requestType === 'balance_topup'
      ? validateNumber(sanitized.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true })
      : undefined;
    const idempotencyKey = validateIdempotencyKey(
      sanitized.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key')
    );
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const callerUid = user.uid;
    const delegateId = user.role === 'delegate' ? user.entityId || callerUid : null;
    const requestFingerprint = createRequestFingerprint({
      requestType,
      garageId: validatedGarageId,
      packageId,
      couponCode,
      amount: amount ?? null
    });
    const requestRef = adminDb.collection('recharge_requests').doc();
    const result = await adminDb.runTransaction(async (t: any) => {
      const garageRef = adminDb.doc(`garages/${validatedGarageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garageData = garageSnap.data() || {};

      if (user.role === 'garage' && user.garageId !== validatedGarageId) {
        throw new Error('GARAGE_SCOPE_MISMATCH');
      }
      if (user.role === 'delegate') {
        const canRequest = garageData.createdByDelegateId === delegateId || garageData.referrerId === delegateId;
        if (!canRequest) throw new Error('GARAGE_SCOPE_MISMATCH');
      }

      const duplicate = await checkIdempotencyInTransaction(
        t,
        idempotencyKey,
        '/api/recharge-requests/create',
        callerUid,
        requestFingerprint
      );
      if (duplicate.isDuplicate) {
        return duplicate.cachedResult || null;
      }

      const pendingGuardRef = adminDb.doc(`recharge_request_guards/${validatedGarageId}`);
      const pendingGuardSnap = await t.get(pendingGuardRef);
      const pendingGuard = pendingGuardSnap.exists ? pendingGuardSnap.data() || {} : {};
      if (typeof pendingGuard.activeRequestId === 'string' && pendingGuard.activeRequestId) {
        const activeRequestSnap = await t.get(adminDb.doc(`recharge_requests/${pendingGuard.activeRequestId}`));
        if (activeRequestSnap.exists && activeRequestSnap.data()?.status === 'pending') {
          throw new Error('PENDING_RECHARGE_REQUEST_EXISTS');
        }
      }
      if (pendingGuard.initialized !== true) {
        const existingRequests = await t.get(
          adminDb.collection('recharge_requests').where('garageId', '==', validatedGarageId)
        );
        if (existingRequests.docs.some((doc: any) => doc.data()?.status === 'pending')) {
          throw new Error('PENDING_RECHARGE_REQUEST_EXISTS');
        }
      }

      const requestData: Record<string, any> = {
        requestId: requestRef.id,
        garageId: validatedGarageId,
        packageId,
        requestType,
        couponCode,
        createdByUid: callerUid,
        requestedByUid: callerUid,
        requestedByRole: user.role,
        idempotencyKey,
        status: 'pending',
        createdAt: new Date()
      };
      if (amount !== undefined) requestData.amount = amount;
      if (user.role === 'delegate') {
        requestData.delegateId = delegateId;
        requestData.delegateName = user.displayName || 'مندوب';
        requestData.garageName = garageData.name || null;
      }

      const createdResult = { id: requestRef.id, data: requestData };
      t.set(pendingGuardRef, {
        garageId: validatedGarageId,
        initialized: true,
        activeRequestId: requestRef.id,
        updatedAt: new Date()
      }, { merge: true });
      t.set(requestRef, requestData);
      storeIdempotencyInTransaction(
        t,
        idempotencyKey,
        createdResult,
        '/api/recharge-requests/create',
        callerUid,
        requestFingerprint
      );
      return createdResult;
    });

    if (!result) return c.json({ success: false, error: 'IDEMPOTENCY_RESULT_UNAVAILABLE' }, 500);
    return c.json({ success: true, id: result.id, data: result.data });
  } catch (err: any) {
    console.error('[Worker] Error creating recharge request:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

workerApp.post('/api/recharge-requests/create', requireWorkerAuth, enforceWorkerFinancialRateLimit, handleCreateRechargeRequest);
workerApp.post('/api/recharge-requests', requireWorkerAuth, enforceWorkerFinancialRateLimit, handleCreateRechargeRequest);

// Handler 2: Process/Approve Recharge Request (POST /api/recharge-requests/process & POST /api/transactions/approve-recharge-request)
const handleApproveRechargeRequest = async (c: any) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
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
      const pendingGuardRef = adminDb.doc(`recharge_request_guards/${targetGarageId}`);
      const pendingGuardSnap = await t.get(pendingGuardRef);
      const pendingGuard = pendingGuardSnap.exists ? pendingGuardSnap.data() || {} : {};
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
        if (pendingGuard.activeRequestId === reqId) {
          t.set(pendingGuardRef, { activeRequestId: null, updatedAt: new Date() }, { merge: true });
        }

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

        t.set(adminDb.doc(`manual_credit_ledger/${reqId}`), {
          operationId: reqId,
          garageId: targetGarageId,
          amount,
          previousBalance,
          newBalance,
          source: 'approved_recharge_request',
          externalReference: requestData.externalReference || requestData.transferReference || null,
          approvedBy: callerUid || 'admin',
          idempotencyKey,
          createdAt: new Date()
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

      const referrerGarageId = garageData.referredByGarageId;
      let referrerRef: any = null;
      let referrerSnap: any = null;
      const isEligibleForReferral = decideReferralReward({ referrerGarageId, targetGarageId, durationDays }).eligible;
      if (isEligibleForReferral && referrerGarageId) {
        referrerRef = adminDb.doc(`garages/${referrerGarageId}`);
        referrerSnap = await t.get(referrerRef);
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

      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, durationDays);

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
      invalidateMaintainedAdminSummary(t);

      t.set(requestRef, {
        status: 'approved',
        commission,
        referrerId: delegateReferrerId,
        amount: effectiveRevenue,
        revenueAmount: effectiveRevenue,
        originalRevenueAmount: effectiveOriginalRevenue,
        resolvedAt: new Date()
      }, { merge: true });
      if (pendingGuard.activeRequestId === reqId) {
        t.set(pendingGuardRef, { activeRequestId: null, updatedAt: new Date() }, { merge: true });
      }

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

      if (isEligibleForReferral && referrerRef && referrerSnap && referrerSnap.exists) {
        const referrerData = referrerSnap.data() || {};
        const refBaseDate = applyReferralReward(referrerData.balanceExpiry, 1);

        t.set(referrerRef, {
          balanceExpiry: refBaseDate,
          totalGaragesReferredCount: (referrerData.totalGaragesReferredCount || 0) + 1,
          lastReferralRewardAt: new Date()
        }, { merge: true });

        const rewardLogRef = adminDb.collection('activity_logs').doc();
        t.set(rewardLogRef, {
          garageId: referrerGarageId,
          garageName: referrerData.name || '',
          staffId: null,
          staffName: 'النظام — مكافأة إحالة تلقائية',
          actionType: 'recharge',
          plateNumber: `🎉 مكافأة إحالة تلقائية: تمديد الاشتراك +1 يوم مجاناً لإحالة ${requestData.garageName || garageData.name || ''}`,
          timestamp: new Date(),
          amount: 0,
          packageId: 'referral_reward',
          details: { type: 'referral_reward', referrerGarageId, referredGarageId: targetGarageId, rewardDaysGiven: 1 }
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

      const targetGarageId = validateId(requestData.garageId, 'garageId', true);
      const pendingGuardRef = adminDb.doc(`recharge_request_guards/${targetGarageId}`);
      const pendingGuardSnap = await t.get(pendingGuardRef);
      const pendingGuard = pendingGuardSnap.exists ? pendingGuardSnap.data() || {} : {};

      t.set(requestRef, { status: 'rejected', resolvedAt: new Date() }, { merge: true });
      if (pendingGuard.activeRequestId === requestId) {
        t.set(pendingGuardRef, { activeRequestId: null, updatedAt: new Date() }, { merge: true });
      }

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
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const status = c.req.query('status');
    if (status && !['pending', 'approved', 'rejected'].includes(status)) return c.json({ success: false, error: 'INVALID_STATUS' }, 400);
    let pageRequest;
    try {
      pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), `recharge-requests:admin:${status || 'all'}`);
    } catch (error: any) {
      return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
    }
    const requestsCollection = adminDb.collection('recharge_requests');
    let requestsQuery: any = requestsCollection;
    if (status) requestsQuery = requestsQuery.where('status', '==', status);
    requestsQuery = requestsQuery.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    requestsQuery = firestorePageStartAfter(requestsQuery, requestsCollection, pageRequest.cursor);
    const requestsSnapshot = await requestsQuery.limit(pageRequest.pageSize + 1).get();
    const requestPage = buildFirestorePage(requestsSnapshot.docs, pageRequest, 'createdAt');
    const requests = requestPage.documents.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return c.json({ success: true, requests, items: requests, hasMore: requestPage.hasMore, nextCursor: requestPage.nextCursor });
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
    let scope: string;
    if (delegateId) {
      query = adminDb.collection('recharge_requests').where('delegateId', '==', delegateId);
      scope = `recharge-requests:delegate:${delegateId}`;
    } else if (garageId) {
      query = adminDb.collection('recharge_requests').where('garageId', '==', garageId);
      scope = `recharge-requests:garage:${garageId}`;
    } else {
      return c.json({ success: true, requests: [], items: [], hasMore: false, nextCursor: null });
    }

    let pageRequest;
    try {
      pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), scope);
    } catch (error: any) {
      return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
    }
    const requestsCollection = adminDb.collection('recharge_requests');
    query = query.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    query = firestorePageStartAfter(query, requestsCollection, pageRequest.cursor);
    const snap = await query.limit(pageRequest.pageSize + 1).get();
    const requestPage = buildFirestorePage(snap.docs, pageRequest, 'createdAt');
    const requests = requestPage.documents.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return c.json({ success: true, requests, items: requests, hasMore: requestPage.hasMore, nextCursor: requestPage.nextCursor });
  } catch (err: any) {
    console.error('[Worker] Error fetching my recharge requests:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Handler 6: Direct Balance Top-Up (POST /api/transactions/admin-topup-balance)
workerApp.post('/api/transactions/admin-topup-balance', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
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
      invalidateMaintainedAdminSummary(t);

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

      t.set(adminDb.doc(`manual_credit_ledger/${createRequestFingerprint({ garageId, amount: numAmount, idempotencyKey })}`), {
        operationId: idempotencyKey,
        garageId,
        amount: numAmount,
        previousBalance,
        newBalance,
        source: 'admin_direct_topup',
        approvedBy: callerUid || 'admin',
        idempotencyKey,
        createdAt: new Date()
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
    const delegateSnap = await delegateRef.get();
    if (!delegateSnap.exists) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);

    const garagesCollection = adminDb.collection('garages');
    const requestsCollection = adminDb.collection('recharge_requests');
    const childQuery = (name: string) => name === 'createdGarages'
      ? garagesCollection.where('createdByDelegateId', '==', delegateId)
      : name === 'referredGarages'
        ? garagesCollection.where('referrerId', '==', delegateId)
        : requestsCollection.where('delegateId', '==', delegateId);
    const allowedSections = ['createdGarages', 'referredGarages', 'requests'];
    const readChildPage = async (name: string, cursor?: string) => {
      const collection = name === 'requests' ? requestsCollection : garagesCollection;
      const pageRequest = parseFirestorePageRequest(c.req.query('limit'), cursor, `delegate-dashboard:${delegateId}:${name}`);
      return readWorkerFirestorePage(childQuery(name), collection, pageRequest);
    };
    try {
      const section = c.req.query('section');
      if (section && section !== 'all') {
        if (!allowedSections.includes(section)) return c.json({ success: false, error: 'INVALID_PAGE_SECTION' }, 400);
        const page = await readChildPage(section, c.req.query('cursor'));
        const items = page.documents.map((doc: any) => section === 'requests'
          ? ({ id: doc.id, ...doc.data() })
          : sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));
        return c.json({
          success: true,
          delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
          ...(section === 'requests' ? { requests: items } : { garages: items }),
          items, hasMore: page.hasMore, nextCursor: page.nextCursor,
          pagination: { [section]: { hasMore: page.hasMore, nextCursor: page.nextCursor } }
        });
      }

      const [createdPage, referredPage, requestPage] = await Promise.all([
        readChildPage('createdGarages', c.req.query('createdGaragesCursor')),
        readChildPage('referredGarages', c.req.query('referredGaragesCursor')),
        readChildPage('requests', c.req.query('requestsCursor'))
      ]);
      const garagesById = new Map<string, any>();
      for (const doc of [...createdPage.documents, ...referredPage.documents]) {
        garagesById.set(doc.id, sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));
      }
      const garages = Array.from(garagesById.values());
      const requests = requestPage.documents.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      return c.json({
        success: true,
        delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
        garages,
        requests,
        pagination: {
          createdGarages: { hasMore: createdPage.hasMore, nextCursor: createdPage.nextCursor },
          referredGarages: { hasMore: referredPage.hasMore, nextCursor: referredPage.nextCursor },
          requests: { hasMore: requestPage.hasMore, nextCursor: requestPage.nextCursor }
        }
      });
    } catch (error: any) {
      if (error?.message === 'INVALID_PAGE_SIZE' || error?.message === 'INVALID_PAGE_CURSOR') {
        return c.json({ success: false, error: error.message }, 400);
      }
      throw error;
    }
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
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
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
      if (!Number.isFinite(previousTotal) || previousTotal <= 0) {
        throw new Error('NO_UNSETTLED_COMMISSION');
      }
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
    if (err?.message === 'NO_UNSETTLED_COMMISSION') {
      return c.json({ success: false, error: 'NO_UNSETTLED_COMMISSION' }, 409);
    }
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

    const requestedStart = c.req.query('start');
    const requestedEnd = c.req.query('end');
    const delegateId = c.req.query('delegateId') ? validateId(c.req.query('delegateId'), 'delegateId', true) : undefined;

    const isStrictDateOnly = (value?: string) => {
      if (value === undefined) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!isStrictDateOnly(requestedStart) || !isStrictDateOnly(requestedEnd)) {
      return c.json({ success: false, code: 'INVALID_REPORT_DATE', error: 'INVALID_REPORT_DATE', statusCode: 400 }, 400);
    }

    if (requestedStart && requestedEnd && new Date(requestedStart) >= new Date(requestedEnd)) {
      return c.json({ success: false, code: 'START_MUST_PRECEDE_END', error: 'START_MUST_PRECEDE_END', statusCode: 400 }, 400);
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const defaultEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const subtractOneCalendarYear = (date: Date) => {
      const year = date.getUTCFullYear() - 1;
      const month = date.getUTCMonth();
      const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
      return new Date(Date.UTC(year, month, day));
    };
    // No-date reports default to the latest 12 calendar months. Partial ranges
    // are bounded too; older history remains available through explicit dates.
    const start = requestedStart || subtractOneCalendarYear(requestedEnd ? new Date(`${requestedEnd}T00:00:00.000Z`) : today).toISOString().slice(0, 10);
    const end = requestedEnd || defaultEnd.toISOString().slice(0, 10);
    if (new Date(start) >= new Date(end)) {
      return c.json({ success: false, code: 'START_MUST_PRECEDE_END', error: 'START_MUST_PRECEDE_END', statusCode: 400 }, 400);
    }
    // Apply inclusive-start/exclusive-end boundaries in Firestore and process
    // stable cursor pages so Worker memory is independent of ledger history.
    const startAt = new Date(`${start}T00:00:00.000Z`);
    const endAt = new Date(`${end}T00:00:00.000Z`);
    // Domain events persist occurredAt as an ISO string, unlike settlement
    // records, whose settledAt field is a Firestore Timestamp/Date.
    const eventStartAt = startAt.toISOString();
    const eventEndAt = endAt.toISOString();
    let eventsQuery: any = adminDb.collectionGroup('events');
    let settlementsQuery: any = adminDb.collection('settlements');
    let creditLedgerQuery: any = adminDb.collection('credit_ledger');
    eventsQuery = eventsQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    settlementsQuery = settlementsQuery.where('settledAt', '>=', startAt).where('settledAt', '<', endAt);
    if (!delegateId) creditLedgerQuery = creditLedgerQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    const accumulator = createFinancialReportAccumulator({ start, end, delegateId });
    const pageSize = 250;
    const forEachPage = async (baseQuery: any, timestampField: string, consume: (value: any) => void) => {
      let cursor: any = null;
      while (true) {
        let pageQuery = baseQuery.orderBy(timestampField, 'asc').orderBy('__name__', 'asc').limit(pageSize);
        if (cursor) pageQuery = pageQuery.startAfter(cursor.timestamp, cursor.ref);
        const page = await pageQuery.get();
        if (page.docs.length === 0) break;
        for (const document of page.docs) consume(document.data() || {});
        if (page.docs.length < pageSize) break;
        const last = page.docs[page.docs.length - 1];
        cursor = { timestamp: last.data()?.[timestampField], ref: last.ref };
      }
    };
    // Load settlement cutoffs before events; keep only totals and one latest
    // timestamp per delegate, never the underlying document arrays.
    await forEachPage(settlementsQuery, 'settledAt', (settlement) => addFinancialReportSettlement(accumulator, settlement));
    await forEachPage(eventsQuery, 'occurredAt', (event) => addFinancialReportEvent(accumulator, event));
    if (!delegateId) await forEachPage(creditLedgerQuery, 'occurredAt', (entry) => addFinancialReportCreditLedgerEntry(accumulator, entry));
    const report = finishFinancialReport(accumulator);

    return c.json({
      success: true,
      data: {
        report,
        filters: { start, end, delegateId: delegateId || null },
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
workerApp.post('/api/garages/create', requireWorkerAuth, enforceWorkerFinancialRateLimit, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role;
    const callerUid = user?.uid;
    const callerName = user?.displayName || '';

    if (!canSubmitGarageApplication(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Creation not permitted for role' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['name', 'phone', 'hourlyRate', 'overnightRate', 'pin', 'billingModel', 'isTrial', 'trialDays', 'defaultTrialDays', 'dailyCapacity', 'initialPackageId', 'packages', 'createdByDelegateId', 'createdByDelegateName', 'referrerId', 'referrerName', 'referredByGarageId', 'referredByGarageName', 'idempotencyKey'], false);
    const { phone: rawPhone, hourlyRate: rawHourlyRate, overnightRate: rawOvernightRate, createdByDelegateId, createdByDelegateName, referrerId, referrerName, referredByGarageId, referredByGarageName } = sanitized;
    const name = validateString(sanitized.name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(sanitized.pin);
    const idempotencyKey = validateIdempotencyKey(
      sanitized.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key')
    );

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const delegateEntityId = callerRole === 'delegate' ? (user?.entityId || callerUid) : undefined;
    let requestFingerprint: string | undefined;
    if (idempotencyKey) {
      const fingerprintPayload: Record<string, unknown> = { ...sanitized };
      delete fingerprintPayload.idempotencyKey;
      delete fingerprintPayload.pin;
      fingerprintPayload.pinLookupHash = computeLookupHash(normPin);
      requestFingerprint = createRequestFingerprint({
        callerRole: callerRole || null,
        delegateEntityId: delegateEntityId || null,
        payload: fingerprintPayload
      });
    }

    const readExistingResult = async (): Promise<{ isDuplicate: boolean; cachedResult?: any }> => {
      if (!idempotencyKey) return { isDuplicate: false };
      let duplicate: { isDuplicate: boolean; cachedResult?: any } = { isDuplicate: false };
      await adminDb.runTransaction(async (t: any) => {
        duplicate = await checkIdempotencyInTransaction(
          t, idempotencyKey, '/api/garages/create', callerUid, requestFingerprint
        );
      });
      return duplicate;
    };

    const initialDuplicate = await readExistingResult();
    if (initialDuplicate.isDuplicate) return c.json(initialDuplicate.cachedResult);

    if (callerRole === 'delegate') {
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
        const duplicate = await readExistingResult();
        if (duplicate.isDuplicate) return c.json(duplicate.cachedResult);
        return c.json({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' }, 409);
      }
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      const duplicate = await readExistingResult();
      if (duplicate.isDuplicate) return c.json(duplicate.cachedResult);
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const phone = rawPhone ? String(rawPhone).trim() : '';
    const hourlyRateValue = rawHourlyRate !== undefined
      ? validateNumber(rawHourlyRate, 'hourlyRate', { min: 0, max: 10000, required: false })
      : 0;
    const overnightRateValue = rawOvernightRate !== undefined
      ? validateNumber(rawOvernightRate, 'overnightRate', { min: 0, max: 10000, required: false })
      : 0;
    const now = new Date();
    const billingModel = 'prepaid_credits';
    const finalDailyCapacity = 0;
    const activePackageName = '';
    const balanceExpiry = null;
    const garageRef = adminDb.collection('garages').doc();
    const garageId = garageRef.id;
    const logRef = adminDb.collection('activity_logs').doc();
    const garageDoc: Record<string, any> = {
      name: name.trim(),
      phone,
      hourlyRate: hourlyRateValue,
      overnightRate: overnightRateValue,
      billingModel,
      status: (callerRole === 'delegate' || createdByDelegateId) ? 'pending' : 'approved',
      hasMonthlySubscribers: false,
      createdAt: now,
      isTrial: false,
      dailyCapacity: finalDailyCapacity,
      activePackageName,
      packageName: activePackageName,
      balanceExpiry,
      balance: 0,
      creditBalance: { paid: 0, referral: 0, trial: 0 },
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

    const activityLog = {
      garageId,
      garageName: garageDoc.name,
      staffId: callerUid || null,
      staffName: callerName || 'الإدارة (إنشاء جراج)',
      actionType: 'create',
      plateNumber: 'إنشاء حساب جراج جديد (نظام الرصيد)',
      timestamp: now,
      amount: 0,
      details: {
        packageName: activePackageName,
        durationDays: 0,
        carsCount: 0,
        revenueAmount: 0,
        isTrial: false
      }
    };
    const result = { success: true, id: garageId };
    let replayedResult: any;
    let isReplay = false;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(
          t, idempotencyKey, '/api/garages/create', callerUid, requestFingerprint
        );
        if (duplicate.isDuplicate) {
          isReplay = true;
          replayedResult = duplicate.cachedResult;
          return;
        }
      }

      await saveEntityPinInTransaction(t, 'garages', garageId, normPin);
      t.set(garageRef, garageDoc);
      t.set(maintainedGarageSummaryRef(garageId), {
        schemaVersion: MAINTAINED_SUMMARY_VERSION,
        garageId,
        name: garageDoc.name,
        carsInside: 0,
        totalSubscribersCount: 0,
        activeSubscribersCount: 0,
        expiredSubscribersCount: 0,
        balanceExpiry,
        isTrial: false,
        dailyCapacity: finalDailyCapacity,
        hourlyRate: hourlyRateValue,
        createdAt: now,
        updatedAt: now
      });
      writeMaintainedAdminDelta(t, {
        totalGarages: 1,
        activeGarages: 1
      });
      t.set(logRef, activityLog);
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t, idempotencyKey, result, '/api/garages/create', callerUid, requestFingerprint
        );
      }
    });

    return c.json(isReplay ? replayedResult : result);
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
    const { id, ...data } = body || {};
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const updates: Record<string, any> = { updatedAt: new Date() };
    const allowedKeys = [
      'name', 'phone', 'hourlyRate', 'overnightRate', 'monthlySubscriptionFee', 
      'billingModel', 'commissionPerVehicle', 'status', 'isLocked', 'lockReason', 'isSuspended', 'isMaintenanceMode', 
      'maintenanceMessage', 'warningDaysThreshold', 'assignedDelegateId', 'currentSessionId',
      'hasMonthlySubscribers', 'allowMonthlySubscribers', 'subscriberFlatFee', 'checkInSound', 'checkOutSound', 'ownerName', 'dailyCapacity', 'capacity',
      'shimmerColor', 'activePackageName', 'trialDecision', 'trialDecisionAt',
      'referredByGarageId', 'referredByGarageName', 'referrerId', 'referrerName', 'createdByDelegateId', 'createdByDelegateName',
      'balance', 'balanceExpiry', 'totalReferralRewardDays', 'carsInside'
    ];
    for (const key of allowedKeys) {
      if (key in data && data[key] !== undefined) {
        updates[key] = data[key];
      }
    }

    await adminDb.collection('garages').doc(id).update(updates);
    await maintainedAdminSummaryRef().set({ schemaVersion: MAINTAINED_SUMMARY_VERSION, summaryScope: 'admin', stale: true, updatedAt: new Date() }, { merge: true });
    return c.json({ success: true });
  } catch (err: any) {
    console.error('[Worker Garage] Error updating garage:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Garage deletion handlers live in a dedicated module; all three routes share the same server authority.
workerApp.post('/api/garages/delete', requireWorkerAuth, startGarageDeletionRoute);
workerApp.post('/api/garages/delete-step', requireWorkerAuth, advanceGarageDeletionRoute);
workerApp.get('/api/garages/delete-status', requireWorkerAuth, readGarageDeletionStatusRoute);

// Handler 4 & 5: Query Garages (GET /api/garages & GET /api/garages/:id)
workerApp.get('/api/garages', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!['admin', 'delegate'].includes(user?.role || '')) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const garagesCollection = adminDb.collection('garages');
    let query: any = garagesCollection;
    let pageScope = `garages:admin:${user.uid}`;
    if (user?.role === 'delegate') {
      const delegateId = user.entityId || user.uid;
      query = query.where('createdByDelegateId', '==', delegateId);
      pageScope = `garages:delegate:${delegateId}`;
    }

    let pageRequest;
    try {
      pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), pageScope);
    } catch (error: any) {
      return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
    }
    query = query.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    query = firestorePageStartAfter(query, garagesCollection, pageRequest.cursor);
    const snap = await query.limit(pageRequest.pageSize + 1).get();
    const garagePage = buildFirestorePage(snap.docs, pageRequest, 'createdAt');
    const garages = garagePage.documents.map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));

    return c.json({ success: true, garages, items: garages, hasMore: garagePage.hasMore, nextCursor: garagePage.nextCursor });
  } catch (err: any) {
    console.error('[Worker Garage] Error listing garages:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Read-only consistency diagnostics & Event Ledger reconciliation.
workerApp.post('/api/garages/reconciliation', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'reconciliation')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const garageId = validateId(body?.garageId, 'garageId', true);
    const garageRef = adminDb.doc(`garages/${garageId}`);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(today);
    const [insideSnap, dailyStatsSnap, eventsSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get(),
      adminDb.collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'desc')
        .get()
    ]);
    const reconciliation = reconcileGarageState({
      today,
      insideVehicleCount: insideSnap.size,
      garage: garageSnap.data() || {},
      dailyStats: dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {},
      events: eventsSnap.docs.map((doc: any) => doc.data() || {})
    });

    return c.json({ success: true, data: { garageId, date: today, ...reconciliation } });
  } catch (err: any) {
    console.error('[Worker Garage] Error in reconciliation:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

workerApp.post('/api/garages/dashboard-summary/rebuild', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'dashboard-summary/rebuild')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { garageId, date } = body || {};
    if (!garageId || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const targetDate = date || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    if (!isValidDateKey(targetDate)) throw new Error('INVALID_DATE');

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const [bucketSnap, eventsSnap, garageSnap, dailyStatsSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', targetDate).get(),
      adminDb.collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'asc')
        .get(),
      adminDb.doc(`garages/${garageId}`).get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${targetDate}`).get()
    ]);
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    const eventProjection = calculateDailyProjection(
      eventsSnap.docs.map((doc: any) => doc.data() || {}),
      targetDate
    );
    const summary = aggregateProjectionBuckets(bucketSnap.docs.map((doc: any) => doc.data() || {}));
    const reconciliation = reconcileDashboardSummary(summary, eventProjection);
    const legacy = garageSnap.data() || {};
    const dailyStats = dailyStatsSnap.data() || {};
    const dailyRevenue = parseMoneyAmount(dailyStats.revenue) ?? 0;
    const legacyDifferences = {
      activeVehicleCount: summary.activeVehicleCount - Number(legacy.carsInside || 0),
      entriesToday: summary.entriesToday - Number(dailyStats.count || 0),
      grossRevenue: Number((summary.grossRevenue - dailyRevenue).toFixed(2))
    };
    const summaryData = {
      ...summary,
      garageId,
      dateId: targetDate,
      rebuiltAt: new Date().toISOString(),
      rebuiltBy: user?.uid || 'admin',
      eventProjection,
      reconciliation,
      legacyDifferences
    };
    await adminDb.doc(`garages/${garageId}/dashboard_summary/current`).set(summaryData, { merge: true });
    return c.json({
      success: true,
      data: {
        summary: summaryData,
        bucketCount: bucketSnap.size ?? bucketSnap.docs.length,
        eventCount: eventsSnap.size ?? eventsSnap.docs.length,
        consistentWithEvents: reconciliation.consistent,
        legacyDifferences
      }
    });
  } catch (err: any) {
    console.error('[Worker Garage] Error rebuilding dashboard summary:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

workerApp.post('/api/garages/rebuild-projections', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'rebuild-projections')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { garageId, date } = body || {};
    if (!garageId || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const targetDate = date || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    if (!isValidDateKey(targetDate)) return c.json({ success: false, error: 'INVALID_DATE' }, 400);

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const eventsSnap = await adminDb.collection(`garages/${garageId}/events`)
      .where('occurredAt', '>=', dayStart.toISOString())
      .where('occurredAt', '<', nextDayStart.toISOString())
      .orderBy('occurredAt', 'asc')
      .get();

    const lastEvent = eventsSnap.docs.at(-1);
    const lastEventData = lastEvent?.data() || {};
    const eventWatermark = {
      lastProcessedOccurredAt: lastEventData.occurredAt || null,
      lastProcessedEventId: lastEventData.eventId || lastEvent?.id || null,
      projectionVersion: 1
    };
    const projection = calculateDailyProjection(
      eventsSnap.docs.map((doc: any) => doc.data() || {}),
      targetDate
    );
    const projectionRef = adminDb.doc(`garages/${garageId}/daily_stats/${targetDate}`);
    const projectionData = {
      ...projection,
      rebuiltAt: new Date().toISOString(),
      eventWatermark,
      rebuiltBy: user?.uid || 'admin'
    };

    await projectionRef.set(projectionData, { merge: true });
    return c.json({ success: true, data: { garageId, date: targetDate, projection: projectionData } });
  } catch (err: any) {
    console.error('[Worker Garage] Error in rebuild-projections:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
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
    const [bucketSnap, garageSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', today).get(),
      adminDb.doc(`garages/${garageId}`).get()
    ]);
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
    c.header('Server-Timing', `dashboard-summary;dur=${Date.now() - startedAt}`);
    if (bucketSnap.empty) {
      const summarySnap = await adminDb.doc(`garages/${garageId}/dashboard_summary/current`).get();
      if (!summarySnap.exists) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_NOT_READY' }, 404);
      const storedSummary = summarySnap.data() || {};
      if (!isFreshDashboardSummary(storedSummary, today)) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
      const normalizedMoney = normalizeStoredDashboardMoney(storedSummary);
      if (!normalizedMoney) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
      c.header('X-Summary-Source', 'stored_rebuild');
      return c.json({ success: true, data: { garageId, summary: { ...storedSummary, ...normalizedMoney } } });
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

workerApp.post('/api/garages/trial-decision', requireWorkerAuth, async (c) => {
  try {
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_DB_NOT_INITIALIZED' }, 503);

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const garageId = validateId(body.garageId, 'garageId', true);
    const trialDecision = body.trialDecision;
    const allowedDecisions = ['continued', 'declined', 'dismissed', 'resolved'];
    if (trialDecision !== null && !allowedDecisions.includes(trialDecision)) {
      return c.json({ success: false, error: 'INVALID_TRIAL_DECISION' }, 400);
    }

    const user = c.get('user');
    if (!canUpdateTrialDecision(user, garageId, trialDecision)) {
      return c.json({ success: false, error: 'FORBIDDEN: Trial decision is outside your authority' }, 403);
    }

    const garageRef = adminDb.doc(`garages/${garageId}`);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    await garageRef.set({
      trialDecision,
      trialDecisionAt: trialDecision ? new Date() : null,
      updatedAt: new Date()
    }, { merge: true });

    const logRef = adminDb.collection('activity_logs').doc();
    await logRef.set({
      garageId,
      garageName: garageSnap.data()?.name || '',
      staffId: user?.uid || null,
      staffName: user?.displayName || 'مستخدم',
      actionType: 'update_trial_decision',
      plateNumber: trialDecision ? `قرار التجربة: ${trialDecision}` : 'مسح قرار التجربة',
      timestamp: new Date(),
      amount: 0,
      details: { trialDecision }
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Worker Garage] Error updating trial decision:', error);
    return c.json({ success: false, error: error?.message || 'SERVER_ERROR' }, 400);
  }
});

// Staff Management Routes
workerApp.post('/api/staff/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { name, phone, pin, garageId, role, permissions } = body;
    if (!canManageStaffForGarage(user, garageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot add staff to this garage' }, 403);
    }

    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(pin);

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const staffRef = adminDb.collection('staff').doc();
    const staffId = staffRef.id;

    await adminDb.runTransaction(async (t: any) => {
      await saveEntityPinInTransaction(t, 'staff', staffId, normPin);
      t.set(staffRef, {
        name: normName.trim(),
        phone: phone ? String(phone).trim() : '',
        garageId,
        role: role || 'worker',
        permissions: permissions || {},
        createdAt: new Date()
      });
    });

    return c.json({ success: true, id: staffId });
  } catch (e: any) {
    console.error('[Worker Staff] Error in create:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/staff/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id, name, phone, role, permissions, pin } = body;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const staffId = validateId(id, 'id', true);
    const normalizedPin = pin ? validateNewPin(pin, 'newPin') : null;
    if (normalizedPin) {
      const pinCheck = await checkPinAvailabilityAcrossAll(normalizedPin, staffId);
      if (pinCheck.taken) return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (role) updates.role = role;
    if (permissions) updates.permissions = permissions;

    const staffRef = adminDb.collection('staff').doc(staffId);
    await adminDb.runTransaction(async (t: any) => {
      const targetStaffSnap = await t.get(staffRef);
      if (!targetStaffSnap.exists) throw new Error('STAFF_NOT_FOUND');
      if (!canManageStaffForGarage(user, targetStaffSnap.data()?.garageId)) {
        throw new Error('FORBIDDEN: Cannot update staff outside your garage');
      }
      if (normalizedPin) await saveEntityPinInTransaction(t, 'staff', staffId, normalizedPin);
      t.update(staffRef, updates);
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Staff] Error in update:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e?.message === 'STAFF_NOT_FOUND') return c.json({ success: false, error: 'STAFF_NOT_FOUND' }, 404);
    if (String(e?.message || '').includes('FORBIDDEN')) return c.json({ success: false, error: 'FORBIDDEN: Cannot update staff outside your garage' }, 403);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/staff/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id } = body;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const staffId = validateId(id, 'id', true);
    const staffRef = adminDb.collection('staff').doc(staffId);
    await adminDb.runTransaction(async (t: any) => {
      const targetStaffSnap = await t.get(staffRef);
      if (user?.role !== 'admin' && (!targetStaffSnap.exists || !canManageStaffForGarage(user, targetStaffSnap.data()?.garageId))) {
        throw new Error('FORBIDDEN: Cannot delete staff outside your garage');
      }
      await deleteEntityPinInTransaction(t, 'staff', staffId);
      t.delete(staffRef);
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Staff] Error in delete:', e);
    if (String(e?.message || '').includes('FORBIDDEN')) return c.json({ success: false, error: 'FORBIDDEN: Cannot delete staff outside your garage' }, 403);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Retired role endpoints remain as explicit, non-mutating tombstones for old clients.
workerApp.post('/api/supervisors/create', requireWorkerAuth, (c) => c.json({ success: false, error: 'ROLE_RETIRED' }, 410));
workerApp.post('/api/supervisors/update', requireWorkerAuth, (c) => c.json({ success: false, error: 'ROLE_RETIRED' }, 410));
workerApp.post('/api/supervisors/delete', requireWorkerAuth, (c) => c.json({ success: false, error: 'ROLE_RETIRED' }, 410));

// Delegates Management Routes
workerApp.post('/api/delegates/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { name, phone, pin, commissionRate, commissions, defaultTrialDays } = body;
    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    const normPhone = phone ? String(phone).trim() : '';
    const normPin = validateNewPin(pin);

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const delRef = adminDb.collection('delegates').doc();
    const delId = delRef.id;

    await adminDb.runTransaction(async (t: any) => {
      await saveEntityPinInTransaction(t, 'delegates', delId, normPin);
      t.set(delRef, {
        name: normName.trim(),
        phone: normPhone,
        commissionRate: commissionRate !== undefined ? Number(commissionRate) : 10,
        commissions: commissions || { daily: 5, weekly: 15, biweekly: 25, monthly: 50 },
        defaultTrialDays: defaultTrialDays !== undefined ? Number(defaultTrialDays) : 15,
        balance: 0,
        totalEarned: 0,
        createdAt: new Date()
      });
      writeMaintainedAdminDelta(t, { totalDelegates: 1 });
    });

    return c.json({ success: true, id: delId });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in create:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/delegates/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canManageDelegates(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id, name, phone, commissionRate, commissions, defaultTrialDays, pin } = body;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const delegateId = validateId(id, 'id', true);
    const unsupportedFields = Object.keys(body).filter((field) =>
      !['id', 'name', 'phone', 'commissionRate', 'commissions', 'defaultTrialDays', 'pin'].includes(field)
    );
    if (unsupportedFields.length > 0) {
      return c.json({ success: false, error: `UNSUPPORTED_FIELDS: ${unsupportedFields.join(',')}` }, 400);
    }

    const normalizedPin = pin ? validateNewPin(pin, 'newPin') : null;
    if (normalizedPin) {
      const pinCheck = await checkPinAvailabilityAcrossAll(normalizedPin, delegateId);
      if (pinCheck.taken) return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (commissionRate !== undefined) updates.commissionRate = Number(commissionRate);
    if (commissions) updates.commissions = commissions;
    if (defaultTrialDays !== undefined) updates.defaultTrialDays = Number(defaultTrialDays);

    const delegateRef = adminDb.collection('delegates').doc(delegateId);
    await adminDb.runTransaction(async (t: any) => {
      const delegateSnap = await t.get(delegateRef);
      if (!delegateSnap.exists) throw new Error('DELEGATE_NOT_FOUND');
      if (normalizedPin) await saveEntityPinInTransaction(t, 'delegates', delegateId, normalizedPin);
      t.update(delegateRef, updates);
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in update:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e?.message === 'DELEGATE_NOT_FOUND') return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/delegates/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canManageDelegates(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id } = body;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const delegateId = validateId(id, 'id', true);
    const delegateRef = adminDb.collection('delegates').doc(delegateId);
    let missingDelegate = false;
    let unsettledCycleTotal = 0;
    await adminDb.runTransaction(async (t: any) => {
      const delegateSnap = await t.get(delegateRef);
      if (!delegateSnap.exists) {
        missingDelegate = true;
        return;
      }
      const delegateData = delegateSnap.data() || {};
      unsettledCycleTotal = Number(delegateData.totalRechargedAmount || 0);
      if (!Number.isFinite(unsettledCycleTotal) || unsettledCycleTotal !== 0) return;
      await deleteEntityPinInTransaction(t, 'delegates', delegateId);
      t.delete(delegateRef);
    });
    if (missingDelegate) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    if (!Number.isFinite(unsettledCycleTotal) || unsettledCycleTotal !== 0) {
      return c.json({
        success: false,
        error: 'DELEGATE_HAS_UNSETTLED_COMMISSION',
        unsettledCycleTotal
      }, 409);
    }

    await maintainedAdminSummaryRef().set({ schemaVersion: MAINTAINED_SUMMARY_VERSION, summaryScope: 'admin', stale: true, updatedAt: new Date() }, { merge: true });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// People / Entity PIN Update
workerApp.post('/api/people/update-pin', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { entityType, entityId, newPin } = body;
    if (!entityType || !entityId || !['garages', 'delegates', 'staff'].includes(entityType)) {
      return c.json({ success: false, error: 'INVALID_ENTITY_TYPE' }, 400);
    }

    const normNewPin = validateNewPin(newPin, 'newPin');
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let targetGarageId: unknown = entityType === 'garages' ? entityId : undefined;
    if (entityType === 'staff' && user?.role !== 'admin') {
      const targetStaffSnap = await adminDb.collection('staff').doc(entityId).get();
      targetGarageId = targetStaffSnap.exists ? targetStaffSnap.data()?.garageId : null;
    }
    if (!canUpdateEntityPin(user, entityType, targetGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Insufficient permissions' }, 403);
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normNewPin, entityId);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    await saveEntityPin(entityType, entityId, normNewPin);

    const targetDocRef = adminDb.collection(entityType).doc(entityId);
    const docSnap = await targetDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      const updates: Record<string, any> = { updatedAt: new Date() };
      if ('pin' in data) updates.pin = null;
      if ('ownerPin' in data) updates.ownerPin = null;
      if ('adminPin' in data) updates.adminPin = null;
      if ('pinLookupHash' in data) updates.pinLookupHash = null;
      await targetDocRef.set(updates, { merge: true });
    }

    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker People] Error in update-pin:', e);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_NEW_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Admin Announcements Routes
workerApp.post('/api/admin/announcements/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const data = { ...body, createdAt: new Date() };
    const docRef = await adminDb.collection('announcements').add(data);
    return c.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error('[Worker Announcements] Error in create:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/admin/announcements/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await adminDb.collection('announcements').doc(id).delete();
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Announcements] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/admin/announcements/toggle', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id, isActive } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await adminDb.collection('announcements').doc(id).update({ isActive: Boolean(isActive) });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Announcements] Error in toggle:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Admin Coupons Routes
workerApp.post('/api/admin/coupons/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const couponData = { ...body, usedCount: 0, createdAt: new Date() };
    const docRef = await adminDb.collection('coupons').add(couponData);
    return c.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error('[Worker Coupons] Error in create:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/admin/coupons/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id, ...data } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await adminDb.collection('coupons').doc(id).update(data);
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Coupons] Error in update:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

workerApp.post('/api/admin/coupons/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await adminDb.collection('coupons').doc(id).delete();
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Coupons] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Admin Packages Routes
workerApp.post('/api/admin/packages/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const rawPackage = await c.req.json().catch(() => ({}));
    const validatedPackage = validatePackageCatalogRecord(rawPackage, 'new');
    if (validatedPackage.catalogType !== 'credit_bundle') throw new Error('PACKAGE_NOT_CREDIT_BUNDLE');
    const pkgData: Record<string, any> = {
      name: validatedPackage.name,
      price: validatedPackage.basePrice,
      catalogType: validatedPackage.catalogType,
      isActive: true,
      createdAt: new Date()
    };
    pkgData.creditQuantity = validatedPackage.creditQuantity;

    const docRef = await adminDb.collection('packages').add(pkgData);
    return c.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error('[Worker Packages] Error in create:', e);
    const statusCode = ['INVALID_PACKAGE_CONFIGURATION', 'PACKAGE_NOT_CREDIT_BUNDLE'].includes(e?.message) ? 400 : 500;
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, statusCode as any);
  }
});

workerApp.post('/api/admin/packages/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await adminDb.collection('packages').doc(id).update({ isActive: false });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Packages] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Keep the legacy Admin Extend Fair Use frontend path as a supported alias.
const handleExtendFairUse = async (c: any) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const garageId = validateId(c.req.param('id'), 'garageId');
    const body = await c.req.json().catch(() => ({}));
    const extraCars = Math.max(0, Number(body?.extraCars || 0));
    const idempotencyKey = validateIdempotencyKey(body?.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestFingerprint = createRequestFingerprint({ garageId, extraCars });

    let resultFairUse: any = null;
    let resultData: any = null;
    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(
          t,
          idempotencyKey,
          '/api/admin/garages/:id/extend-fair-use',
          user?.uid,
          requestFingerprint
        );
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult;
          return;
        }
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');

      const garageData = garageSnap.data() || {};
      const isUnlimited = Number(garageData.dailyCapacity || 0) === 0 || String(garageData.activePackageName || '').includes('مفتوح');
      if (!isUnlimited) throw new Error('NOT_AN_UNLIMITED_PACKAGE');

      let fairUse = garageData.unlimitedFairUse;
      if (!fairUse || !fairUse.isActive) {
        fairUse = initializeFairUse(garageData.durationDays || 30, garageData.activePackageName || '');
      }

      resultFairUse = manualAdminExtendFairUse(fairUse, extraCars);
      t.set(garageRef, { unlimitedFairUse: resultFairUse }, { merge: true });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: user?.uid || 'admin',
        staffName: 'مدير النظام (Admin)',
        actionType: 'fair_use_admin_extended',
        plateNumber: `تمديد استثنائي للاستخدام العادل (+${extraCars > 0 ? extraCars : fairUse.stepAmount} سيارة)`,
        timestamp: new Date(),
        details: {
          currentAllowance: resultFairUse.currentAllowance,
          maxAllowance: resultFairUse.maxAllowance,
          cycleCarsCount: resultFairUse.cycleCarsCount
        }
      });

      resultData = { success: true, unlimitedFairUse: resultFairUse };
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t,
          idempotencyKey,
          resultData,
          '/api/admin/garages/:id/extend-fair-use',
          user?.uid,
          requestFingerprint
        );
      }
    });

    return c.json(resultData);
  } catch (err: any) {
    console.error('[Worker Admin] Error in extend-fair-use:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

workerApp.post('/api/admin/garages/:id/extend-fair-use', requireWorkerAuth, handleExtendFairUse);
workerApp.post('/api/garages/:id/extend-fair-use', requireWorkerAuth, handleExtendFairUse);

// Admin confirms offline payment and explicitly grants non-expiring prepaid credits.
workerApp.post('/api/garages/:id/credit-grants', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'ADMIN_ONLY' }, 403);
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['packageId', 'amount', 'paymentAmountEgp', 'paymentConfirmed', 'paymentReference', 'reason', 'idempotencyKey'], false);
    if (sanitized.paymentConfirmed !== true) return c.json({ success: false, error: 'PAYMENT_CONFIRMATION_REQUIRED' }, 400);
    const paymentReference = validateString(sanitized.paymentReference, 'paymentReference', { min: 1, max: 120, required: true });
    const reason = validateString(sanitized.reason, 'reason', { min: 1, max: 300, required: true });
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || c.req.header('idempotency-key') || c.req.header('x-idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    const packageId = sanitized.packageId ? validateId(sanitized.packageId, 'packageId', true) : null;
    if (packageId === null && sanitized.amount === undefined) return c.json({ success: false, error: 'CREDIT_AMOUNT_REQUIRED' }, 400);
    if (packageId !== null && sanitized.amount !== undefined) return c.json({ success: false, error: 'CHOOSE_TEMPLATE_OR_AMOUNT' }, 400);
    const paymentAmountEgp = validateNumber(sanitized.paymentAmountEgp, 'paymentAmountEgp', { min: 1, max: 1_000_000, integerOnly: true });
    const callerUid = user.uid;
    const requestFingerprint = createRequestFingerprint({ garageId, packageId, amount: sanitized.amount, paymentAmountEgp, paymentReference, reason });
    let granted: any = null;
    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/garages/:id/credit-grants', callerUid, requestFingerprint);
      if (isDuplicate) { granted = cachedResult; return; }
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garage = garageSnap.data() || {};
      if (garage.billingModel !== 'prepaid_credits') throw new Error('GARAGE_NOT_PREPAID');
      const isFirstPaidGrant = !garage.firstPaidCreditGrantAt;
      const referrerGarageId = typeof garage.referredByGarageId === 'string' ? garage.referredByGarageId : '';
      const referralMarkerRef = isFirstPaidGrant ? adminDb.doc(`credit_referral_awards/${garageId}`) : null;
      const referralMarkerSnap = referralMarkerRef ? await t.get(referralMarkerRef) : null;
      const referrerRef = isFirstPaidGrant && referralMarkerRef && !referralMarkerSnap?.exists && referrerGarageId && referrerGarageId !== garageId ? adminDb.doc(`garages/${referrerGarageId}`) : null;
      const referrerSnap = referrerRef ? await t.get(referrerRef) : null;
      let amount: number;
      let template: any = null;
      if (packageId) {
        const templateRef = adminDb.doc(`packages/${packageId}`);
        const templateSnap = await t.get(templateRef);
        if (!templateSnap.exists) throw new Error('PACKAGE_NOT_FOUND');
        template = { id: templateSnap.id, ...templateSnap.data() };
        if (template.isActive === false || template.catalogType !== 'credit_bundle') throw new Error('PACKAGE_NOT_CREDIT_BUNDLE');
        const validatedTemplate = validatePackageCatalogRecord(template, template.id);
        amount = validatedTemplate.creditQuantity;
        if (validatedTemplate.finalPrice !== amount) throw new Error('CREDIT_TEMPLATE_PRICE_MISMATCH');
      } else {
        amount = validateNumber(sanitized.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true });
      }
      if (paymentAmountEgp !== amount) throw new Error('PAYMENT_AMOUNT_MUST_MATCH_CREDITS');
      const balance = {
        paid: Number(garage.creditBalance?.paid || 0),
        referral: Number(garage.creditBalance?.referral || 0),
        trial: Number(garage.creditBalance?.trial || 0),
      };
      const transition = grantPaidCredits({ balance, amount, garageId, actorUid: callerUid, actorRole: 'admin', reason, reference: paymentReference, occurredAt: new Date().toISOString(), idempotencyKey });
      if (transition.ok === false) throw new Error(transition.error);
      const entry = materializeCreditLedgerEntry(transition.value.entry);
      if (entry.ok === false) throw new Error(entry.error);
      let referralAward: any = null;
      let referralLedger: any = null;
      let referralTransition: any = null;
      if (isFirstPaidGrant && referrerRef && referrerSnap?.exists && referrerSnap.data()?.billingModel === 'prepaid_credits' && referralMarkerRef && !referralMarkerSnap?.exists) {
        const referrer = referrerSnap.data() || {};
        const rewardIdempotencyKey = `first_paid_grant:${garageId}`;
        referralTransition = awardReferralCredits({
          balance: { paid: Number(referrer.creditBalance?.paid || 0), referral: Number(referrer.creditBalance?.referral || 0), trial: Number(referrer.creditBalance?.trial || 0) },
          garageId: referrerGarageId,
          actorUid: callerUid,
          actorRole: 'admin',
          reason: 'First confirmed paid grant referral reward',
          reference: garageId,
          occurredAt: transition.value.entry.occurredAt,
          idempotencyKey: rewardIdempotencyKey,
          referrerGarageId,
          referredGarageId: garageId,
          paidGrantConfirmed: true,
          firstPaidGrant: true,
        });
        if (referralTransition.ok === false) throw new Error(referralTransition.error);
        const materializedReward = materializeCreditLedgerEntry(referralTransition.value.entry);
        if (materializedReward.ok === false) throw new Error(materializedReward.error);
        referralLedger = materializedReward.value;
        referralAward = { garageId: referrerGarageId, amount: 20, bucket: 'referral', entryId: referralLedger.entryId };
      }
      const now = new Date();
      t.set(garageRef, { creditBalance: transition.value.balance, ...(isFirstPaidGrant ? { firstPaidCreditGrantAt: now } : {}) }, { merge: true });
      t.set(adminDb.doc(`credit_ledger/${entry.value.entryId}`), { ...entry.value, source: packageId ? 'admin_template_grant' : 'admin_entered_grant', packageId, packageName: template?.name || null, paymentConfirmed: true, paymentAmountEgp, paymentReference });
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'credit_grant',
        aggregateId: entry.value.entryId,
        eventType: 'prepaid_credit_grant_paid',
        actorUid: callerUid,
        actorRole: 'admin',
        idempotencyKey,
        payload: { amount: paymentAmountEgp, creditAmount: amount, creditLedgerEntryId: entry.value.entryId }
      });
      t.set(adminDb.collection('activity_logs').doc(), { garageId, garageName: garage.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_grant', timestamp: new Date(), details: { amount, paymentAmountEgp, packageId, paymentReference, reason, ledgerEntryId: entry.value.entryId } });
      if (referralLedger && referralAward && referrerRef && referralMarkerRef) {
        t.set(referrerRef, { creditBalance: referralTransition.value.balance }, { merge: true });
        t.set(adminDb.doc(`credit_ledger/${referralLedger.entryId}`), { ...referralLedger, source: 'first_paid_grant_referral', referredGarageId: garageId });
        t.set(adminDb.collection('activity_logs').doc(), { garageId: referrerGarageId, garageName: referrerSnap.data()?.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_referral_award', timestamp: new Date(), details: { referredGarageId: garageId, amount: 20, ledgerEntryId: referralLedger.entryId } });
      }
      if (isFirstPaidGrant && referralMarkerRef && !referralMarkerSnap?.exists) {
        t.set(referralMarkerRef, {
          referredGarageId: garageId,
          referrerGarageId: referrerGarageId || null,
          ledgerEntryId: referralLedger?.entryId || null,
          amount: referralLedger ? 20 : 0,
          status: referralLedger ? 'awarded' : (referrerGarageId ? 'referrer_not_prepaid' : 'no_eligible_referrer'),
          createdAt: now,
          createdBy: callerUid,
        });
      }
      granted = { garageId, amount, paymentAmountEgp, balance: transition.value.balance, entryId: entry.value.entryId, referralAward };
      storeIdempotencyInTransaction(t, idempotencyKey, granted, '/api/garages/:id/credit-grants', callerUid, requestFingerprint);
    });
    return c.json({ success: true, data: granted });
  } catch (error: any) {
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Admin and the garage owner can inspect the same scoped, read-only credit history.
workerApp.get('/api/garages/:id/credit-ledger', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const scopedGarage = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);
    if (user?.role !== 'admin' && !scopedGarage) return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    const pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), `credit-ledger:${garageId}`);
    const collection = adminDb.collection('credit_ledger');
    let query = collection.where('garageId', '==', garageId).orderBy('occurredAt', 'desc').orderBy('__name__', 'desc');
    query = firestorePageStartAfter(query, collection, pageRequest.cursor);
    const snapshot = await query.limit(pageRequest.pageSize + 1).get();
    const page = buildFirestorePage(snapshot.docs, pageRequest, 'occurredAt');
    const entries = page.documents.map((doc: any) => {
      const row = doc.data() || {};
      const common = { id: doc.id, entryId: row.entryId, garageId: row.garageId, kind: row.kind, bucket: row.bucket, amount: row.amount, balanceBefore: row.balanceBefore, balanceAfter: row.balanceAfter, occurredAt: row.occurredAt };
      return user?.role === 'admin' ? { ...common, paymentAmountEgp: row.paymentAmountEgp, actorUid: row.actorUid, actorRole: row.actorRole, reason: row.reason, reference: row.reference, idempotencyKey: row.idempotencyKey, source: row.source, packageId: row.packageId, packageName: row.packageName } : common;
    });
    return c.json({ success: true, data: entries, hasMore: page.hasMore, nextCursor: page.nextCursor });
  } catch (error: any) {
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Transactions: Recharge Garage
workerApp.post('/api/transactions/recharge-garage', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'ADMIN_ONLY' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['garageId', 'packageId', 'adminDetails', 'idempotencyKey'], false);
    const garageId = validateId(sanitized.garageId, 'garageId', true);
    const packageId = validateId(sanitized.packageId, 'packageId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || c.req.header('idempotency-key') || c.req.header('x-idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    const callerUid = user?.uid;
    const adminDetails = sanitized.adminDetails || {};
    const requestFingerprint = createRequestFingerprint({ garageId, packageId, adminDetails });

    const pkgSnap = await adminDb.doc(`packages/${packageId}`).get();
    if (!pkgSnap.exists) return c.json({ success: false, error: 'PACKAGE_NOT_FOUND' }, 404);
    const packageObj = { id: pkgSnap.id, ...pkgSnap.data() };
    if (packageObj.isActive === false) return c.json({ success: false, error: 'PACKAGE_INACTIVE' }, 409);

    const validatedPackage = validatePackageCatalogRecord(packageObj, packageObj.id);
    const durationDays = validatedPackage.durationDays;
    const basePrice = validatedPackage.basePrice;
    const discountAmount = validatedPackage.discountAmount;
    const price = validatedPackage.finalPrice;
    const packageName = validatedPackage.name;
    const isUnlimited = validatedPackage.isUnlimited;
    const effCapacity = validatedPackage.dailyCapacity;

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/recharge-garage', callerUid, requestFingerprint);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');

      const garageData = garageSnap.data() || {};
      if (garageData.hasMonthlySubscribers === true && durationDays < 15) {
        throw new Error('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION');
      }

      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, durationDays);

      const referrerGarageId = garageData.referredByGarageId;
      let referrerRef: any = null;
      let referrerSnap: any = null;
      const isEligibleForReferral = decideReferralReward({
        referrerGarageId,
        targetGarageId: garageId,
        durationDays,
        price,
        requiresPositivePrice: true
      }).eligible;
      if (isEligibleForReferral && referrerGarageId) {
        referrerRef = adminDb.doc(`garages/${referrerGarageId}`);
        referrerSnap = await t.get(referrerRef);
      }

      const newRevenue = Number(((garageData.totalAdminRevenue || 0) + price).toFixed(2));
      const updateData: any = {
        totalAdminRevenue: newRevenue,
        isLocked: false,
        isTrial: false,
        dailyCapacity: effCapacity,
        activePackageName: packageName,
        packageName: packageName,
        lastRechargeDate: new Date(),
        lastRechargeAmount: price,
        lastRechargePackageName: packageName,
        balanceExpiry: baseDate,
        billingModel: 'subscription',
        unlimitedFairUse: isUnlimited ? initializeFairUse(durationDays, packageName) : null
      };

      t.set(garageRef, updateData, { merge: true });
      invalidateMaintainedAdminSummary(t);

      const logRef = adminDb.collection('activity_logs').doc();
      const staffNameText = adminDetails.staffName || 'مدير النظام (Admin)';
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: adminDetails.staffId ? validateId(adminDetails.staffId, 'staffId') : (callerUid || 'admin'),
        staffName: staffNameText,
        actionType: 'recharge',
        plateNumber: `تجديد اشتراك: ${packageName} (${durationDays} يوم) - ${price} ج`,
        timestamp: new Date(),
        amount: price,
        packageId: packageId || packageObj.id || 'direct_recharge',
        details: {
          packageName,
          durationDays,
          carsCount: effCapacity,
          revenueAmount: price,
          originalRevenueAmount: price,
          discountAmount,
          rechargedBy: staffNameText
        }
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'recharge',
        aggregateId: idempotencyKey || `direct_${garageId}_${Date.now()}`,
        eventType: 'recharge_approved',
        actorUid: callerUid || 'admin',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        payload: { source: 'direct_admin_recharge', packageId, packageName, amount: price, originalAmount: basePrice, discountAmount, durationDays, dailyCapacity: effCapacity }
      });

      if (isEligibleForReferral && referrerRef && referrerSnap && referrerSnap.exists) {
        const referrerData = referrerSnap.data() || {};
        const refBaseDate = applyReferralReward(referrerData.balanceExpiry, 1);

        t.set(referrerRef, {
          balanceExpiry: refBaseDate,
          totalGaragesReferredCount: (referrerData.totalGaragesReferredCount || 0) + 1,
          lastReferralRewardAt: new Date()
        }, { merge: true });

        const rewardLogRef = adminDb.collection('activity_logs').doc();
        t.set(rewardLogRef, {
          garageId: referrerGarageId,
          garageName: referrerData.name || '',
          staffId: null,
          staffName: 'النظام — مكافأة إحالة تلقائية',
          actionType: 'recharge',
          plateNumber: `🎉 مكافأة إحالة تلقائية: تمديد الاشتراك +1 يوم مجاناً لإحالة ${garageData.name || ''}`,
          timestamp: new Date(),
          amount: 0,
          packageId: 'referral_reward',
          details: { type: 'referral_reward', referrerGarageId, referredGarageId: garageId, rewardDaysGiven: 1 }
        });
      }

      resultData = {
        newExpiry: baseDate.toISOString(),
        totalAdminRevenue: newRevenue
      };

      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/recharge-garage', callerUid, requestFingerprint);
    });

    return c.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Worker Transaction] Error in recharge-garage:', error);
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Transactions: Garage Self-Subscribe Using Balance
workerApp.post('/api/transactions/garage-self-subscribe', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
  /* istanbul ignore next -- retained below only as a migration reference until the route is deleted */
  try {
    const user = c.get('user');
    const userRole = user?.role;
    const userGarageId = user?.garageId || user?.entityId;
    const callerUid = user?.uid;

    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['garageId', 'packageId', 'packageData', 'idempotencyKey'], false);
    const bodyGarageId = validateId(sanitized.garageId, 'garageId', false);
    const packageId = validateId(sanitized.packageId, 'packageId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || c.req.header('idempotency-key') || c.req.header('x-idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    const garageId = userRole === 'garage' ? userGarageId : (bodyGarageId || userGarageId);
    const requestFingerprint = createRequestFingerprint({ garageId, packageId });

    if (userRole === 'garage' && userGarageId && bodyGarageId && userGarageId !== bodyGarageId) {
      return c.json({ success: false, error: 'UNAUTHORIZED_GARAGE_ACCESS' }, 403);
    }
    if (!['garage', 'admin'].includes(userRole || '')) {
      return c.json({ success: false, error: 'FORBIDDEN: Role not authorized for self subscribe' }, 403);
    }
    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/garage-self-subscribe', callerUid, requestFingerprint);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');

      const garageData = garageSnap.data() || {};
      const currentBalance = Number(garageData.balance || 0);

      const settingsSnap = await t.get(adminDb.doc('system_config/global'));
      const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};
      const subscriberFlatFee = systemConfig?.subscriberFlatFee !== undefined
        ? Math.max(0, Number(systemConfig.subscriberFlatFee))
        : (systemConfig?.monthlySubscribersFlatFee !== undefined ? Number(systemConfig.monthlySubscribersFlatFee) : 500);

      let pkg: any = null;
      if (packageId) {
        const pkgRef = adminDb.doc(`packages/${packageId}`);
        const pkgSnap = await t.get(pkgRef);
        if (pkgSnap.exists) pkg = { id: pkgSnap.id, ...pkgSnap.data() };
      }

      if (!pkg) throw new Error('PACKAGE_NOT_FOUND');
      if (pkg.isActive === false) throw new Error('PACKAGE_INACTIVE');

      const validatedPackage = validatePackageCatalogRecord(pkg, pkg.id || packageId);
      const durationDays = validatedPackage.durationDays;
      let effectivePrice = validatedPackage.finalPrice;
      if (garageData.hasMonthlySubscribers === true) {
        effectivePrice += subscriberFlatFee;
      }

      if (currentBalance < effectivePrice) {
        throw new Error(`INSUFFICIENT_BALANCE: الرصيد المتاح (${currentBalance} ج.م) غير كافٍ للاشتراك في هذه الباقة (${effectivePrice} ج.م)`);
      }

      const newBalance = currentBalance - effectivePrice;

      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, durationDays);

      const pkgName = validatedPackage.name;
      const isUnlimitedPkg = validatedPackage.isUnlimited;
      const effCapacity = validatedPackage.dailyCapacity;

      t.set(garageRef, {
        balance: newBalance,
        balanceExpiry: baseDate,
        dailyCapacity: effCapacity,
        activePackageName: pkgName,
        packageName: pkgName,
        billingModel: 'subscription',
        isLocked: false,
        isTrial: false,
        lastRechargeDate: new Date(),
        lastRechargeAmount: effectivePrice,
        lastRechargePackageName: pkgName,
        unlimitedFairUse: isUnlimitedPkg ? initializeFairUse(durationDays, pkgName) : null
      }, { merge: true });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: callerUid || 'owner',
        staffName: garageData.ownerName || 'مدير الجراج',
        actionType: 'self_subscribe',
        plateNumber: `تفعيل باقة بالرصيد: ${pkgName} (${durationDays} يوم)`,
        timestamp: new Date(),
        amount: effectivePrice,
        packageId: pkg.id || packageId,
        details: {
          packageName: pkgName,
          durationDays,
          carsCount: effCapacity,
          cost: effectivePrice,
          previousBalance: currentBalance,
          remainingBalance: newBalance
        }
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'wallet',
        aggregateId: garageId,
        eventType: 'wallet_debited',
        actorUid: callerUid || 'system',
        actorRole: userRole || 'garage',
        idempotencyKey,
        payload: { amount: effectivePrice, previousBalance: currentBalance, newBalance, reason: 'package_purchase', packageId: pkg.id || packageId }
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'recharge',
        aggregateId: idempotencyKey,
        eventType: 'package_purchased',
        actorUid: callerUid || 'system',
        actorRole: userRole || 'garage',
        idempotencyKey,
        payload: { packageId: pkg.id || packageId, packageName: pkgName, amount: effectivePrice, durationDays, dailyCapacity: effCapacity, previousBalance: currentBalance, remainingBalance: newBalance }
      });

      resultData = {
        garageId,
        newBalance,
        newExpiry: baseDate.toISOString(),
        packageName: pkgName,
        deductedAmount: effectivePrice
      };

      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/garage-self-subscribe', callerUid, requestFingerprint);
    });

    return c.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Worker Transaction] Error in garage-self-subscribe:', error);
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Transactions: Use Referral Reward Days
workerApp.post('/api/transactions/use-referral-reward', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
  try {
    const user = c.get('user');
    const callerUid = user?.uid;
    const callerRole = user?.role;
    const callerGarageId = user?.garageId || (callerRole === 'garage' ? user?.entityId : null);

    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['garageId', 'idempotencyKey'], false);
    const garageId = validateId(sanitized.garageId, 'garageId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || c.req.header('idempotency-key') || c.req.header('x-idempotency-key'));

    if (callerRole !== 'admin' && callerRole !== 'garage') {
      return c.json({ success: false, error: 'ADMIN_OR_GARAGE_ONLY' }, 403);
    }
    if (callerRole === 'garage' && callerGarageId !== garageId) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot claim reward for another garage' }, 403);
    }
    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let claimedDays = 0;
    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/use-referral-reward', callerUid);
      if (isDuplicate) {
        claimedDays = cachedResult?.daysClaimed || 0;
        return;
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');

      const garageData = garageSnap.data() || {};
      const rewardDays = Math.max(0, Number(garageData.totalReferralRewardDays || 0));
      if (rewardDays <= 0) throw new Error('NO_REFERRAL_REWARDS_AVAILABLE');

      claimedDays = rewardDays;
      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, rewardDays);

      t.update(garageRef, {
        balanceExpiry: baseDate,
        totalReferralRewardDays: 0,
        isLocked: false,
        lastReferralClaimAt: new Date()
      });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: callerUid || null,
        staffName: callerRole === 'admin' ? 'الإدارة' : 'صاحب الجراج (استخدام رصيد المكافآت)',
        actionType: 'recharge',
        plateNumber: `استخدام مكافأة إحالة — تمديد الاشتراك +${rewardDays} ${rewardDays === 1 ? 'يوم مجاني' : rewardDays === 2 ? 'يومان مجانيان' : 'أيام مجانية'}`,
        timestamp: new Date(),
        amount: 0,
        details: { type: 'use_referral_reward', claimedDays: rewardDays, newExpiry: baseDate.toISOString() }
      });

      storeIdempotencyInTransaction(t, idempotencyKey, { daysClaimed: claimedDays }, '/api/transactions/use-referral-reward', callerUid);
    });

    return c.json({ success: true, daysClaimed: claimedDays });
  } catch (e: any) {
    console.error('[Worker Reward] Error in use-referral-reward:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Garage Maintenance: Recalculate Cars Inside
workerApp.post('/api/garages/recalculate-cars-inside', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId } = body;
    if (!garageId || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    if (!canRunGarageMaintenance(user, 'recalculate-cars-inside')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const vehSnap = await adminDb.collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get();
    const actualCount = vehSnap.size;

    await adminDb.collection('garages').doc(garageId).update({ carsInside: actualCount });
    return c.json({ success: true, count: actualCount });
  } catch (e: any) {
    console.error('[Worker Garage] Error in recalculate-cars-inside:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
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
