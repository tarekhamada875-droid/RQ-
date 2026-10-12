import express, { type Express } from 'express';
import cors from 'cors';
import rechargesRouter from './routes/recharges';
import reportsRouter from './routes/reports';
import { registerAuthRoutes } from './routes/auth';
import {
  adminDb
} from './firebaseAdmin';
import {
  requireAuth,
  AuthRequest,
  correlationMiddleware,
  requestTimeoutMiddleware,
  financialRateLimiter
} from './middleware';
import { operationTraceMiddleware } from './operationTrace';
import {
  validateId,
  validateNumber,
  validateString,
  validateIdempotencyKey,
} from './validation';
import {
  checkIdempotencyInTransaction,
  storeIdempotencyInTransaction,
  createRequestFingerprint
} from './idempotency';
import { mapDomainErrorToStatus } from './routes/helpers';

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const normalizedOrigin = origin.replace(/\/+$/, '');

  // Preview deployments must be added explicitly through ALLOWED_ORIGINS.
  if (process.env.ALLOWED_ORIGINS) {
    const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    if (customOrigins.includes(normalizedOrigin)) return true;
  }

  // The backend trusts its own canonical URL (injected by the hosting platform)
  // and paired dev/preview domains for this specific service instance.
  if (process.env.APP_URL) {
    const canonicalAppUrl = process.env.APP_URL.replace(/\/+$/, '');
    if (normalizedOrigin === canonicalAppUrl) return true;

    const pairedAppUrl = canonicalAppUrl.includes('ais-dev-')
      ? canonicalAppUrl.replace('ais-dev-', 'ais-pre-')
      : canonicalAppUrl.includes('ais-pre-')
        ? canonicalAppUrl.replace('ais-pre-', 'ais-dev-')
        : '';
    if (pairedAppUrl && normalizedOrigin === pairedAppUrl) return true;
  }

  const exactOrigins = new Set([
    'https://aistudio.google.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ]);

  if (exactOrigins.has(normalizedOrigin)) return true;

  try {
    const parsed = new URL(normalizedOrigin);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
    if (
      hostname === 'parqv2.pages.dev' ||
      hostname === 'parq1.pages.dev' ||
      hostname === 'rq-acg.pages.dev' ||
      ((hostname.startsWith('ais-dev-') || hostname.startsWith('ais-pre-')) && hostname.endsWith('.run.app'))
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function createApp(options: Readonly<{ apiPreviewApp?: Express }> = {}) {
  const app = express();
  app.set('trust proxy', 1);

  // Dynamic Multi-Tenant CORS policy
  app.use(cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Backend-Operator-Token',
      'X-Session-ID',
      'X-Correlation-ID',
      'X-Operation-ID',
      'Idempotency-Key'
    ]
  }));

  app.use(express.json());
  app.use(correlationMiddleware);
  app.use(requestTimeoutMiddleware(15000));
  app.use(operationTraceMiddleware);

  // Mount Modular Routers
  app.use('/api/transactions', rechargesRouter);
  app.use('/api/reports', reportsRouter);
  const authRouter = express.Router();
  registerAuthRoutes(authRouter);
  app.use('/', authRouter);

  // Secure Server API: Authoritative Garage Creation
  app.post('/api/supervisors/create', requireAuth, (_req: AuthRequest, res: any) =>
    res.status(410).json({ success: false, error: 'ROLE_RETIRED' })
  );

  app.post('/api/supervisors/update', requireAuth, (_req: AuthRequest, res: any) =>
    res.status(410).json({ success: false, error: 'ROLE_RETIRED' })
  );

  app.post('/api/supervisors/delete', requireAuth, (_req: AuthRequest, res: any) =>
    res.status(410).json({ success: false, error: 'ROLE_RETIRED' })
  );

  // Secure Server API: Subscribers (Add / Renew / Update / Delete)
  app.post('/api/recharge-requests/create', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    try {
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const callerRole = req.user?.role;
      if (callerRole !== 'garage' && callerRole !== 'delegate') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage owner or delegate required' });
      }

      const garageId = validateId(req.body?.garageId, 'garageId', true);
      const garageSnap = await adminDb.doc(`garages/${garageId}`).get();
      if (!garageSnap.exists) return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });
      const garageData = garageSnap.data() || {};

      if (callerRole === 'garage' && req.user?.garageId !== garageId) {
        return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
      }
      if (callerRole === 'delegate') {
        const delegateId = req.user?.entityId || req.user?.uid;
        const canRequest = garageData.createdByDelegateId === delegateId || garageData.referrerId === delegateId;
        if (!canRequest) return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
      }

      const idempotencyKey = validateIdempotencyKey(
        req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']
      );
      if (!idempotencyKey) {
        return res.status(400).json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' });
      }

      const requestType = req.body?.requestType === 'balance_topup' ? 'balance_topup' : 'subscription';
      const packageId = validateString(req.body?.packageId, 'packageId', { required: false });
      if (requestType !== 'balance_topup' && !packageId) {
        return res.status(400).json({ success: false, error: 'PACKAGE_REQUIRED' });
      }

      // Never persist client-supplied prices, commissions, capacity, duration, or
      // discount values for subscription requests. Approval derives these from
      // the authoritative package/configuration documents.
      const cleanData: Record<string, unknown> = {
        requestType,
        garageId,
        packageId: packageId || null,
        couponCode: validateString(req.body?.couponCode, 'couponCode', { required: false }) || null,
        createdByUid: req.user?.uid || null,
        idempotencyKey
      };
      if (callerRole === 'delegate') {
        const delegateId = req.user?.entityId || req.user?.uid || null;
        cleanData.delegateId = delegateId;
        cleanData.delegateName = req.user?.displayName || null;
        cleanData.garageName = garageData.name || null;
      }
      if (requestType === 'balance_topup') {
        const amount = validateNumber(req.body?.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true });
        cleanData.amount = amount;
      }
      const requestFingerprint = createRequestFingerprint({
        requestType,
        garageId,
        packageId: packageId || null,
        couponCode: cleanData.couponCode,
        amount: cleanData.amount || null
      });

      let createdId: string | null = null;
      await adminDb.runTransaction(async (t: any) => {
        const duplicate = await checkIdempotencyInTransaction(
          t,
          idempotencyKey,
          '/api/recharge-requests/create',
          req.user?.uid,
          requestFingerprint
        );
        if (duplicate.isDuplicate) {
          createdId = duplicate.cachedResult?.id || null;
          return;
        }

        const docRef = adminDb.collection('recharge_requests').doc();
        createdId = docRef.id;
        t.set(docRef, {
          ...cleanData,
          status: 'pending',
          createdAt: new Date()
        });
        storeIdempotencyInTransaction(
          t,
          idempotencyKey,
          { id: docRef.id },
          '/api/recharge-requests/create',
          req.user?.uid,
          requestFingerprint
        );
      });

      return res.json({ success: true, id: createdId });
    } catch (e: any) {
      console.error('[Server RechargeRequests] Error in create:', e);
      const { statusCode, message } = mapDomainErrorToStatus(e);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  if (options.apiPreviewApp) app.use('/api', options.apiPreviewApp);

  // Vite development middleware vs Static Production serving
  
  // API 404 handler

  // API 404 handler
  app.use('/api', (_req: express.Request, res: express.Response) => {
    res.status(404).json({ success: false, error: 'API route not found' });
  });

  // Global error handler to prevent HTML stack traces
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Express Global Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'INTERNAL_SERVER_ERROR' });
  });

  return app;
}

export const app = createApp();
