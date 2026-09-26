import express, { type Express } from 'express';
import cors from 'cors';
import vehiclesRouter from './routes/vehicles';
import subscribersRouter from './routes/subscribers';
import delegatesRouter from './routes/delegates';
import rechargesRouter from './routes/recharges';
import garagesRouter from './routes/garages';
import reportsRouter from './routes/reports';
import { registerAuthRoutes } from './routes/auth';
import {
  adminDb,
  adminAuth
} from './firebaseAdmin';
import {
  saveEntityPin,
  checkPinAvailabilityAcrossAll
} from './utils';
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
  validateNewPin,
  ValidationError
} from './validation';
import {
  checkIdempotencyInTransaction,
  storeIdempotencyInTransaction,
  createRequestFingerprint
} from './idempotency';
import {
  initializeFairUse,
  manualAdminExtendFairUse
} from './unlimitedFairUse';
import { validatePackageCatalogRecord } from './packageCatalog';

/**
 * Domain Error Status Code Resolver
 */
function mapDomainErrorToStatus(err: any): { statusCode: number; code: string; message: string } {
  if (err instanceof ValidationError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message };
  }

  const errMsg = String(err?.message || err || '');

  if (errMsg.includes('GARAGE_NOT_FOUND') || errMsg.includes('VEHICLE_NOT_FOUND') || errMsg.includes('REQUEST_NOT_FOUND') || errMsg.includes('PACKAGE_NOT_FOUND') || errMsg.includes('SUBSCRIBER_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'The requested resource was not found.' };
  }

  if (
    errMsg.includes('REQUEST_ALREADY_PROCESSED') ||
    errMsg.includes('VEHICLE_ALREADY_INSIDE') ||
    errMsg.includes('VEHICLE_ALREADY_OUTSIDE') ||
    errMsg.includes('INSUFFICIENT_BALANCE') ||
    errMsg.includes('CAPACITY_LIMIT_REACHED') ||
    errMsg.includes('PACKAGE_INACTIVE') ||
    errMsg.includes('INVALID_PACKAGE_CONFIGURATION') ||
    errMsg.includes('IDEMPOTENCY_KEY_REUSE') ||
    errMsg.includes('FAIR_USE_LIMIT_REACHED') ||
    errMsg.includes('DAILY_DELETION_LIMIT_REACHED') ||
    errMsg.includes('DELEGATE_DAILY_GARAGE_LIMIT_REACHED') ||
    errMsg.includes('reached_daily_deletion_limit') ||
    errMsg.includes('PIN_ALREADY_TAKEN') ||
    errMsg.includes('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION') ||
    errMsg.includes('MONTHLY_SUBSCRIBER_NOT_CHECKED_IN') ||
    errMsg.includes('NO_REFERRAL_REWARDS_AVAILABLE') ||
    errMsg.includes('SUBSCRIPTION_EXPIRED') ||
    errMsg.includes('SUBSCRIBER_ALREADY_EXISTS')
  ) {
    return { statusCode: 409, code: 'CONFLICT', message: 'The requested operation conflicts with the current state.' };
  }

  if (
    errMsg.includes('FORBIDDEN') ||
    errMsg.includes('UNAUTHORIZED_GARAGE_ACCESS') ||
    errMsg.includes('GARAGE_SCOPE_MISMATCH') ||
    errMsg.includes('ADMIN_ONLY') ||
    errMsg.includes('GARAGE_CANNOT_RECHARGE_OTHERS') ||
    errMsg.includes('ADMIN_OR_SUPERVISOR_ONLY')
  ) {
    return { statusCode: 403, code: 'FORBIDDEN', message: 'You are not authorized to perform this operation.' };
  }

  if (errMsg.includes('UNAUTHORIZED') || errMsg.includes('INVALID_ID_TOKEN') || errMsg.includes('SESSION_INACTIVE')) {
    return { statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication is required.' };
  }

  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'An internal server error occurred.' };
}

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
    'https://rq-production-af02.up.railway.app',
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
      hostname === 'rq-acg.pages.dev'
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
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/subscribers', subscribersRouter);
  app.use('/api/delegates', delegatesRouter);
  app.use('/api/transactions', rechargesRouter);
  app.use('/api/garages', garagesRouter);
  app.use('/api/reports', reportsRouter);
  const authRouter = express.Router();
  registerAuthRoutes(authRouter);
  app.use('/', authRouter);

  // Health endpoint reporting process readiness without sensitive info
  app.get('/api/health', (_req, res) => {
    const isReady = !!(adminDb && adminAuth);
    const version = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown';
    if (!isReady) {
      return res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        adminSdk: false,
        version
      });
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      adminSdk: true,
      version
    });
  });

  // Public / Authenticated GET System Config (for wallet number, flat fee, maintenance status, etc.)
  app.get('/api/system-config', async (_req, res) => {
    try {
      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }
      const snap = await adminDb.doc('system_config/global').get();
      if (!snap.exists) {
        return res.json({
          success: true,
          config: {
            defaultTrialDays: 2,
            warningDaysThreshold: 3,
            walletNumber: '',
            monthlySubscribersFlatFee: 500,
            monthlySubscribersSurchargePercent: 25,
            referralFeePerRenewal: 100,
            delegateMonthlyCommission: 100,
            isMaintenanceMode: false,
            maintenanceMessage: '',
            adminColor: '#10b981'
          }
        });
      }
      return res.json({ success: true, config: { id: snap.id, ...snap.data() } });
    } catch (e: any) {
      console.error('[Server] Error fetching system-config:', e);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Admin Update System Config (General Settings & Wallet Number)
  app.post('/api/admin/update-system-config', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const body = req.body || {};
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
        updatePayload.monthlySubscribersFlatFee = Number(body.monthlySubscribersFlatFee) || 500;
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

      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Admin] Error in update-system-config:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Admin Extend Garage Fair-Use Allowance
  app.post('/api/admin/garages/:id/extend-fair-use', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }

      const garageId = validateId(req.params.id, 'garageId');
      const extraCars = Math.max(0, Number(req.body?.extraCars || 0));

      let resultFairUse: any = null;
      await adminDb.runTransaction(async (t: any) => {
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error('GARAGE_NOT_FOUND');
        }

        const garageData = garageSnap.data() || {};
        const isUnlimited = Number(garageData.dailyCapacity || 0) === 0 || String(garageData.activePackageName || '').includes('مفتوح');
        if (!isUnlimited) {
          throw new Error('NOT_AN_UNLIMITED_PACKAGE');
        }

        let fairUse = garageData.unlimitedFairUse;
        if (!fairUse || !fairUse.isActive) {
          fairUse = initializeFairUse(garageData.durationDays || 30, garageData.activePackageName || '');
        }

        resultFairUse = manualAdminExtendFairUse(fairUse, extraCars);
        t.set(garageRef, { unlimitedFairUse: resultFairUse }, { merge: true });

        // Activity log
        const logRef = adminDb.collection('activity_logs').doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || '',
          staffId: req.user?.uid || 'admin',
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
      });

      return res.json({ success: true, unlimitedFairUse: resultFairUse });
    } catch (err: any) {
      console.error('[Server Admin] Error in extend-fair-use:', err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Authoritative Garage Creation
  app.post('/api/supervisors/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { name, phone, pin, permissions } = req.body || {};
      const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
      const normPin = validateNewPin(pin);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: 'PIN_ALREADY_TAKEN',
          takenBy: { name: pinCheck.name || '', role: pinCheck.role }
        });
      }

      const supRef = adminDb.collection('supervisors').doc();
      const supId = supRef.id;

      await saveEntityPin('supervisors', supId, normPin);

      await supRef.set({
        name: normName.trim(),
        phone: phone ? String(phone).trim() : '',
        permissions: permissions || {},
        createdAt: new Date()
      });

      return res.json({ success: true, id: supId });
    } catch (e: any) {
      console.error('[Server Supervisor] Error in create:', e);
      if (e instanceof ValidationError) {
        return res.status(e.statusCode).json({ success: false, error: `INVALID_PIN: ${e.message}` });
      }
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Create Delegate (Admin Only)
  app.post('/api/staff/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { name, phone, pin, garageId, role, permissions } = req.body || {};
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      if (callerRole !== 'admin' && (!callerGarageId || callerGarageId !== garageId)) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot add staff to this garage' });
      }

      const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
      const normPin = validateNewPin(pin);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: 'PIN_ALREADY_TAKEN',
          takenBy: { name: pinCheck.name || '', role: pinCheck.role }
        });
      }

      const staffRef = adminDb.collection('staff').doc();
      const staffId = staffRef.id;

      await saveEntityPin('staff', staffId, normPin);

      await staffRef.set({
        name: normName.trim(),
        phone: phone ? String(phone).trim() : '',
        garageId,
        role: role || 'worker',
        permissions: permissions || {},
        createdAt: new Date()
      });

      return res.json({ success: true, id: staffId });
    } catch (e: any) {
      console.error('[Server Staff] Error in create:', e);
      if (e instanceof ValidationError) {
        return res.status(e.statusCode).json({ success: false, error: `INVALID_PIN: ${e.message}` });
      }
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Update Entity PIN (Admin, Supervisor, or Garage Owner for own staff)
  app.post('/api/people/update-pin', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { entityType, entityId, newPin } = req.body || {};
      if (!entityType || !entityId || !['garages', 'supervisors', 'delegates', 'staff'].includes(entityType)) {
        return res.status(400).json({ success: false, error: 'INVALID_ENTITY_TYPE' });
      }

      const normNewPin = validateNewPin(newPin, 'newPin');

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      // Verify Authorization
      if (callerRole === 'supervisor' && entityType !== 'delegates') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Supervisors may manage delegate PINs only' });
      }
      if (callerRole !== 'admin' && callerRole !== 'supervisor') {
        if (entityType === 'staff') {
          const targetStaffSnap = await adminDb.collection('staff').doc(entityId).get();
          if (!targetStaffSnap.exists || targetStaffSnap.data()?.garageId !== callerGarageId) {
            return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot manage staff outside your garage' });
          }
        } else if (entityType === 'garages' && entityId !== callerGarageId) {
          return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot update PIN of other garages' });
        } else if (entityType !== 'staff' && entityType !== 'garages') {
          return res.status(403).json({ success: false, error: 'FORBIDDEN: Insufficient permissions' });
        }
      }

      const pinCheck = await checkPinAvailabilityAcrossAll(normNewPin, entityId);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: 'PIN_ALREADY_TAKEN',
          takenBy: { name: pinCheck.name || '', role: pinCheck.role }
        });
      }

      await saveEntityPin(entityType, entityId, normNewPin);

      // Cleanse public document of legacy pin fields
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

      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server People] Error in update-pin:', e);
      if (e instanceof ValidationError) {
        return res.status(e.statusCode).json({ success: false, error: `INVALID_NEW_PIN: ${e.message}` });
      }
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Garage Referral Reward Claim
  app.post('/api/supervisors/update', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { id, name, phone, permissions } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name) updates.name = String(name).trim();
      if (phone !== undefined) updates.phone = String(phone).trim();
      if (permissions) updates.permissions = permissions;

      await adminDb.collection('supervisors').doc(id).update(updates);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Supervisor] Error in update:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/supervisors/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection('supervisors').doc(id).delete();
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Supervisor] Error in delete:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Delegate Operations (Update / Delete)
  app.post('/api/staff/update', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { id, name, phone, role, permissions } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      if (callerRole !== 'admin') {
        const targetStaffSnap = await adminDb.collection('staff').doc(id).get();
        if (!targetStaffSnap.exists || targetStaffSnap.data()?.garageId !== callerGarageId) {
          return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot update staff outside your garage' });
        }
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name) updates.name = String(name).trim();
      if (phone !== undefined) updates.phone = String(phone).trim();
      if (role) updates.role = role;
      if (permissions) updates.permissions = permissions;

      await adminDb.collection('staff').doc(id).update(updates);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Staff] Error in update:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/staff/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      if (callerRole !== 'admin') {
        const targetStaffSnap = await adminDb.collection('staff').doc(id).get();
        if (!targetStaffSnap.exists || targetStaffSnap.data()?.garageId !== callerGarageId) {
          return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot delete staff outside your garage' });
        }
      }

      await adminDb.collection('staff').doc(id).delete();
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Staff] Error in delete:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Garage Update
  app.post('/api/admin/packages/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const rawPackage = req.body && typeof req.body === 'object' ? req.body : {};
      const validatedPackage = validatePackageCatalogRecord(rawPackage, 'new');
      const pkgData = {
        name: validatedPackage.name,
        price: validatedPackage.basePrice,
        durationDays: validatedPackage.durationDays,
        dailyCapacity: validatedPackage.dailyCapacity,
        vehiclesCount: validatedPackage.dailyCapacity,
        discountType: rawPackage.discountType ?? null,
        discountValue: Number(rawPackage.discountValue ?? 0),
        isUnlimited: validatedPackage.isUnlimited,
        isActive: true,
        createdAt: new Date()
      };

      const docRef = await adminDb.collection('packages').add(pkgData);
      return res.json({ success: true, id: docRef.id });
    } catch (e: any) {
      console.error('[Server Packages] Error in create:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/admin/packages/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection('packages').doc(id).update({ isActive: false });
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Packages] Error in delete:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Announcements (Create / Delete / Toggle)
  app.post('/api/admin/announcements/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const data = {
        ...req.body,
        createdAt: new Date()
      };

      const docRef = await adminDb.collection('announcements').add(data);
      return res.json({ success: true, id: docRef.id });
    } catch (e: any) {
      console.error('[Server Announcements] Error in create:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/admin/announcements/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection('announcements').doc(id).delete();
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Announcements] Error in delete:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/admin/announcements/toggle', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { id, isActive } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection('announcements').doc(id).update({ isActive: Boolean(isActive) });
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Announcements] Error in toggle:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Coupons (Create / Update / Delete)
  app.post('/api/admin/coupons/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const couponData = {
        ...req.body,
        usedCount: 0,
        createdAt: new Date()
      };

      const docRef = await adminDb.collection('coupons').add(couponData);
      return res.json({ success: true, id: docRef.id });
    } catch (e: any) {
      console.error('[Server Coupons] Error in create:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/admin/coupons/update', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { id, ...data } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection('coupons').doc(id).update(data);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Coupons] Error in update:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/admin/coupons/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection('coupons').doc(id).delete();
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Coupons] Error in delete:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

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

  // Secure Server API: Activity Logs (Add)
  app.post('/api/activity-logs/add', requireAuth, async (_req: AuthRequest, res: any) => {
    return res.status(403).json({ success: false, error: 'SERVER_GENERATED_ONLY' });
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
