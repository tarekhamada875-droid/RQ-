import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { adminDb, adminAuth, initializeFirebaseAdmin } from './firebaseAdmin';
import { withTraceContext } from './operationTrace';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { recordDomainEventInTransaction } from './events';
import { parseMoneyAmount } from './money';
import { calculateVehicleCost, saveEntityPin, saveEntityPinInTransaction, deleteEntityPinInTransaction, computeLookupHash, checkPinAvailabilityAcrossAll } from './utils';
import { validateIdempotencyKey, validatePlate, normalizePlateRaw, validateDateRange, validateId, validateNumber, validateNewPin, validateString, sanitizePayload, ValidationError } from './validation';
import { mapDomainErrorToStatus } from './routes/helpers';
import { createOperationId, createVehicleDelta, nextOperationVersion } from './deltaProjection';
import { decideVehicleCheckIn } from './domain/vehicleCheckIn';
import { garageDocumentToCheckInState, vehicleDocumentToCheckInState } from './adapters/vehicleCheckInAdapter';
import { decideVehicleCheckOut } from './domain/vehicleCheckOut';
import { garageDocumentToCheckOutState, vehicleDocumentToCheckOutState } from './adapters/vehicleCheckOutAdapter';
import { authorizeVehicleGarageScope, canManageGarageScopedData as decideGarageScope, canManageDelegates, canManageStaffForGarage, canUpdateEntityPin, canViewFinancialReport, canSubmitGarageApplication, canRunGarageMaintenance } from './domain/authorization';
import { applyCorrection, awardReferralCredits, debitRegularEntry, debitSubscriberRenewal, grantPaidCredits, grantTrialCredits, materializeCreditLedgerEntry, restoreCredits } from './domain/prepaidCreditLedger';
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
import { PinRateLimiterNamespace } from './workerPinRateLimiter';

// Extracted modules (split from this file in the round-18 refactor).
import { requireWorkerAuth, registerSessionRoutes } from './workerSessionRoutes';
import { registerFoundationRoutes } from './workerFoundationRoutes';
import {
  MAINTAINED_SUMMARY_VERSION,
  maintainedGarageSummaryRef,
  maintainedGarageDailySummaryRef,
  maintainedAdminSummaryRef,
  maintainedSubscriberSummaryRef,
  writeMaintainedGarageDelta,
  writeMaintainedGarageDailyDelta,
  writeMaintainedAdminDelta,
  writeMaintainedSubscriberDelta,
  writeProjectionBucket,
  isUsableMaintainedSummary
} from './workerMaintenance';

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

// 5. Foundation routes: /api/health, /api/version, and pre-production spike endpoints.
registerFoundationRoutes(workerApp);

// 5b. Session, PIN-auth, and session-management routes (/api/auth/*).
registerSessionRoutes(workerApp);

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
  getAdminAuth: () => adminAuth,
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
  grantPaidCredits,
  grantTrialCredits,
  awardReferralCredits,
  applyCorrection,
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

// All production API routes are implemented directly on the Fetch-native Hono app.

export { workerApp };
export default {
  fetch: workerApp.fetch
};
