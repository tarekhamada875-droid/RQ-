import express from 'express';
import cors from 'cors';
import vehiclesRouter from './routes/vehicles';
import subscribersRouter from './routes/subscribers';
import delegatesRouter from './routes/delegates';
import rechargesRouter from './routes/recharges';
import garagesRouter from './routes/garages';
import {
  adminDb,
  adminAuth
} from './firebaseAdmin';
import {
  cleanPin,
  verifyPinMatch,
  verifyDocMatch,
  saveEntityPin,
  migratePinToHash,
  checkRateLimit,
  resetRateLimit,
  getAdminPin,
  queryAccountWherePin,
  queryDelegatesWherePhone,
  checkPinAvailabilityAcrossAll
} from './utils';
import {
  requireAuth,
  requireFirebaseUser,
  AuthRequest,
  correlationMiddleware,
  requestTimeoutMiddleware,
  financialRateLimiter,
  sendApiError
} from './middleware';
import {
  validateId,
  validateNumber,
  validateString,
  validateIdempotencyKey,
  validateNewPin,
  isNewPinFormat,
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

  // Preview deployments: add the exact URL here as real ones come up
  // (e.g. via `vercel` CLI output or the Vercel dashboard) rather than
  // trusting anything that merely looks like one of our project names —
  // Vercel project names are self-service, so a naming pattern alone can
  // be deliberately matched by an unrelated project.
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
    'https://parqv2.vercel.app',
    'https://parq1.vercel.app',
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

export function createApp() {
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
      'X-Correlation-ID',
      'Idempotency-Key'
    ]
  }));

  app.use(express.json());
  app.use(correlationMiddleware);
  app.use(requestTimeoutMiddleware(15000));

  // Mount Modular Routers
  app.use('/api/vehicles', vehiclesRouter);
  app.use('/api/subscribers', subscribersRouter);
  app.use('/api/delegates', delegatesRouter);
  app.use('/api/transactions', rechargesRouter);
  app.use('/api/garages', garagesRouter);

  // Health endpoint reporting process readiness without sensitive info
  app.get('/api/health', (_req, res) => {
    const isReady = !!(adminDb && adminAuth);
    const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown';
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

  app.post('/api/auth/verify-pin', requireFirebaseUser, async (req: AuthRequest, res) => {
    try {
      const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
      if (!(await checkRateLimit(clientIp))) {
        return sendApiError(
          res,
          429,
          'RATE_LIMIT_EXCEEDED',
          'تم تجاوز عدد المحاولات المسموح بها، يرجى الانتظار لمدة دقيقة والمحاولة مجدداً',
          req.correlationId
        );
      }

      const credentials = req.body || {};
      const rawInput = credentials.pin || credentials.input;

      const effectiveUid = req.user?.uid || '';
      if (!effectiveUid) {
        return sendApiError(
          res,
          401,
          'UNAUTHORIZED',
          'UNAUTHORIZED: Missing Firebase ID Token',
          req.correlationId
        );
      }

      // Check for UID mismatch if body.uid is supplied alongside verified token
      if (credentials.uid && credentials.uid.trim() !== effectiveUid) {
        return sendApiError(
          res,
          401,
          'UNAUTHORIZED',
          'UID_MISMATCH',
          req.correlationId
        );
      }

      const sessionId = typeof credentials.sessionId === 'string' ? credentials.sessionId.trim() : '';

      // 1. Single Input PIN Verification (Canonical Path)
      if (rawInput) {
        const normInputPin = cleanPin(rawInput);
        if (!isNewPinFormat(normInputPin)) {
          return res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
        }

        const matches: Array<{
          role: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage';
          id: string;
          account?: any;
          isLegacyMatch?: boolean;
        }> = [];

        // Role routing is defined by server-owned collections, never by a
        // client-supplied role. Independent private_pins lookups run in parallel.
        const collectionsToCheck: Array<{ name: string; role: 'supervisor' | 'delegate' | 'staff' | 'garage' }> = [
          { name: 'garages', role: 'garage' },
          { name: 'staff', role: 'staff' },
          { name: 'delegates', role: 'delegate' },
          { name: 'supervisors', role: 'supervisor' }
        ];
        const [adminPinStored, ...collectionResults] = await Promise.all([
          getAdminPin(),
          ...collectionsToCheck.map((coll) => queryAccountWherePin(coll.name, normInputPin))
        ]);

        const adminCheck = verifyPinMatch(normInputPin, adminPinStored);
        if (adminCheck.matches) {
          matches.push({ role: 'admin', id: 'admin', isLegacyMatch: adminCheck.isLegacy });
          if (adminCheck.isLegacy) {
            migratePinToHash('admin_settings', 'auth_pin', normInputPin);
          }
        }

        for (let index = 0; index < collectionsToCheck.length; index += 1) {
          const coll = collectionsToCheck[index];
          const docs = collectionResults[index] || [];
          for (const docSnap of docs) {
            const data = { ...docSnap.data };
            if (docSnap.isLegacyMatch) {
              migratePinToHash(coll.name, docSnap.id, normInputPin);
            }
            // Sanitize: never return plaintext PIN, legacy hash, or lookup hash to client
            delete data.pin;
            delete data.ownerPin;
            delete data.adminPin;
            delete data.pinLookupHash;

            matches.push({
              role: coll.role,
              id: docSnap.id,
              account: { id: docSnap.id, ...data },
              isLegacyMatch: docSnap.isLegacyMatch
            });
          }
        }

        if (matches.length > 1) {
          return res.json({ success: false, error: 'PIN_NOT_UNIQUE' });
        }

        if (matches.length === 1) {
          const match = matches[0];

          if (effectiveUid && sessionId && adminDb) {
            try {
              const entityCollMap: Record<string, string> = {
                admin: 'admin_settings',
                supervisor: 'supervisors',
                delegate: 'delegates',
                garage: 'garages',
                staff: 'staff'
              };
              const secCollMap: Record<string, string> = {
                admin: 'admin_sessions',
                supervisor: 'supervisor_sessions',
                delegate: 'delegate_sessions',
                garage: 'garage_sessions',
                staff: 'staff_sessions'
              };

              const entityColl = entityCollMap[match.role];
              const secColl = secCollMap[match.role];
              const entityDocId = match.role === 'admin' ? 'auth_pin' : match.id;

              if (entityColl && secColl && entityDocId) {
                const entityDocRef = adminDb.doc(`${entityColl}/${entityDocId}`);
                const secDocRef = adminDb.doc(`${secColl}/${effectiveUid}`);

                await adminDb.runTransaction(async (transaction) => {
                  const snap = await transaction.get(entityDocRef);
                  if (snap.exists) {
                    const data = snap.data() || {};
                    const activeSessionId = data.currentSessionId;
                    const rawLastActive = data.lastActive;
                    const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
                    const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
                    const isAlive = activeSessionId && activeSessionId !== sessionId && lastActive > 0 && (Date.now() - lastActive < SESSION_TIMEOUT_MS);
                    
                    if (isAlive) {
                      throw new Error('SESSION_OCCUPIED');
                    }
                  }

                  // Update entity doc with session lock atomically
                  transaction.set(entityDocRef, {
                    currentSessionId: sessionId,
                    lastActive: new Date()
                  }, { merge: true });

                  // Provision security session doc with Admin SDK bypass atomically
                  const resolvedGarageId = match.role === 'staff'
                    ? (snap.data()?.garageId || '')
                    : (match.role === 'garage' ? entityDocId : '');

                  transaction.set(secDocRef, {
                    uid: effectiveUid,
                    role: match.role,
                    entityId: entityDocId,
                    garageId: resolvedGarageId,
                    displayName: match.account?.name || (match.role === 'admin' ? 'مدير النظام' : (match.role === 'garage' ? (match.account?.name || 'مدير الجراج') : match.role)),
                    sessionId,
                    isActive: true,
                    lastActive: new Date(),
                    createdAt: new Date()
                  }, { merge: true });
                });

                console.log(`[Server Auth] Successfully provisioned atomic ${match.role} session for UID: ${effectiveUid}`);
              }
            } catch (claimErr: any) {
              if (claimErr?.message === 'SESSION_OCCUPIED') {
                return res.json({ success: false, error: 'SESSION_OCCUPIED' });
              }
              console.error(`[Server Auth] Failed to provision ${match.role} session:`, claimErr);
              // Fail closed: do not grant account access if session claim fails
              return res.status(500).json({ success: false, error: 'تعذر تهيئة الجلسة الآمنة، يرجى إعادة المحاولة' });
            }
          }

          // Reset rate limit ONLY when authentication and session claim both succeed
          await resetRateLimit(clientIp);

          return res.json({
            success: true,
            role: match.role,
            accountId: match.id,
            account: match.account,
            sessionClaimed: true
          });
        }

        return res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
      }

      // 2. Legacy Phone + PIN Verification (Migration Compatibility Path)
      const normPin = cleanPin(credentials.pin);
      const normPhone = cleanPin(credentials.phone);

      if (!normPin || !normPhone) {
        return res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
      }

      try {
        const delegateDocs = await queryDelegatesWherePhone(normPhone);
        for (const dDoc of delegateDocs) {
          const d = { ...dDoc.data };
          const { matches, isLegacy } = verifyDocMatch(normPin, d);
          if (matches) {
            if (isLegacy) {
              migratePinToHash('delegates', dDoc.id, normPin);
            }
            delete d.pin;
            delete d.ownerPin;
            delete d.adminPin;
            delete d.pinLookupHash;

            if (effectiveUid && sessionId && adminDb) {
              try {
                const entityDocRef = adminDb.doc(`delegates/${dDoc.id}`);
                const securityDocRef = adminDb.doc(`delegate_sessions/${effectiveUid}`);
                await adminDb.runTransaction(async (transaction) => {
                  const snap = await transaction.get(entityDocRef);
                  if (snap.exists) {
                    const data = snap.data() || {};
                    const activeSessionId = data.currentSessionId;
                    const rawLastActive = data.lastActive;
                    const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
                    const isAlive = activeSessionId && activeSessionId !== sessionId && lastActive > 0 && (Date.now() - lastActive < 15 * 60 * 1000);

                    if (isAlive) {
                      throw new Error('SESSION_OCCUPIED');
                    }
                  }

                  const now = new Date();
                  transaction.set(entityDocRef, {
                    currentSessionId: sessionId,
                    lastActive: now
                  }, { merge: true });
                  transaction.set(securityDocRef, {
                    uid: effectiveUid,
                    role: 'delegate',
                    entityId: dDoc.id,
                    sessionId,
                    isActive: true,
                    lastActive: now,
                    createdAt: now
                  }, { merge: true });
                });
              } catch (sessErr: any) {
                console.error('[Server Auth] Error claiming delegate session during phone verification:', sessErr);
                if (sessErr?.message === 'SESSION_OCCUPIED') {
                  return res.json({ success: false, error: 'SESSION_OCCUPIED' });
                }
                // Fail closed
                return res.status(500).json({ success: false, error: 'تعذر تهيئة الجلسة الآمنة، يرجى إعادة المحاولة' });
              }
            }

            // Reset rate limit ONLY when authentication and session claim both succeed
            await resetRateLimit(clientIp);

            return res.json({
              success: true,
              role: 'delegate',
              accountId: dDoc.id,
              account: { id: dDoc.id, ...d },
              sessionClaimed: true
            });
          }
        }
      } catch (e) {
        console.error('[Server Auth] Error searching delegates by phone:', e);
      }

      return res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
    } catch (error) {
      console.error('[Server Auth] Unexpected error in verify-pin:', error);
      return res.status(500).json({ success: false, error: 'حدث خطأ في الاتصال بالخادم' });
    }
  });

  // Secure Server API: Check PIN Availability across all accounts
  app.post('/api/auth/check-pin-availability', requireFirebaseUser, financialRateLimiter(10, 60000), async (req: AuthRequest, res) => {
    try {
      const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
      if (!(await checkRateLimit(clientIp))) {
        return res.status(429).json({
          taken: false,
          error: 'تم تجاوز عدد المحاولات المسموح بها، يرجى الانتظار لمدة دقيقة والمحاولة مجدداً'
        });
      }

      const { pin, excludeId } = req.body || {};
      const normPin = cleanPin(pin);
      if (!normPin) {
        return res.json({ taken: false });
      }

      const result = await checkPinAvailabilityAcrossAll(normPin, excludeId);
      // Return minimal sanitized boolean result to prevent account enumeration
      return res.json({ taken: !!result.taken });
    } catch (error) {
      console.error('[Server Auth] Error in check-pin-availability:', error);
      return res.status(500).json({ taken: false });
    }
  });

  // Temporary one-time admin bootstrap. Remove immediately after use.
  app.post('/api/auth/bootstrap-admin-pin-once', financialRateLimiter(3, 60000), async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      const requestedPin = cleanPin(req.body?.pin);
      if (requestedPin !== '88888899') {
        return res.status(400).json({ success: false, error: 'INVALID_BOOTSTRAP_PIN' });
      }

      const privateRef = adminDb.doc('private_pins/auth_pin');
      const privateSnap = await privateRef.get();
      if (privateSnap.exists && privateSnap.data()?.pin) {
        return res.status(409).json({ success: false, error: 'ADMIN_PIN_ALREADY_INITIALIZED' });
      }

      const adminRef = adminDb.doc('admin_settings/auth_pin');
      await saveEntityPin('admin_settings', 'auth_pin', requestedPin);
      await adminRef.set({ pin: null, pinLookupHash: null }, { merge: true });
      return res.json({ success: true });
    } catch (error) {
      console.error('[Server Auth] One-time admin bootstrap failed:', error);
      return res.status(500).json({ success: false, error: 'ADMIN_BOOTSTRAP_FAILED' });
    }
  });

  // Secure Server API: Verify Admin PIN for Admin Logout
  app.post('/api/auth/verify-admin-pin', requireFirebaseUser, async (req: AuthRequest, res) => {
    try {
      const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
      if (!(await checkRateLimit(clientIp))) {
        return res.status(429).json({
          valid: false,
          error: 'تم تجاوز عدد المحاولات المسموح بها، يرجى الانتظار لمدة دقيقة والمحاولة مجدداً'
        });
      }

      const { pin } = req.body || {};
      const normInput = cleanPin(pin);
      if (!normInput) {
        return res.json({ valid: false });
      }

      let activeAdminPin = await getAdminPin();
      const { matches, isLegacy } = verifyPinMatch(normInput, activeAdminPin);
      if (matches && isLegacy) {
        migratePinToHash('admin_settings', 'auth_pin', normInput);
      }
      if (matches) {
        await resetRateLimit(clientIp);
      }
      return res.json({ valid: matches });
    } catch (error) {
      return res.status(500).json({ valid: false });
    }
  });

  // Secure Server API: Claim / Re-claim Admin Session (Protected against unauthenticated escalation)
  app.post('/api/auth/claim-admin-session', requireFirebaseUser, async (req: AuthRequest, res) => {
    try {
      const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
      if (!(await checkRateLimit(clientIp))) {
        return sendApiError(
          res,
          429,
          'RATE_LIMIT_EXCEEDED',
          'تم تجاوز عدد المحاولات المسموح بها، يرجى الانتظار لمدة دقيقة والمحاولة مجدداً',
          req.correlationId
        );
      }

      const { uid, sessionId, pin } = req.body || {};
      if (!uid || !sessionId || typeof uid !== 'string' || typeof sessionId !== 'string') {
        return sendApiError(res, 400, 'INVALID_INPUT', 'بيانات غير صالحة', req.correlationId);
      }

      if (!adminDb) {
        return sendApiError(res, 500, 'SERVICE_UNAVAILABLE', 'Admin DB غير مهيأ', req.correlationId);
      }

      const effectiveUid = req.user?.uid || '';
      if (!effectiveUid) {
        return sendApiError(res, 401, 'UNAUTHORIZED', 'UNAUTHORIZED: Missing Firebase ID Token', req.correlationId);
      }

      if (uid.trim() !== effectiveUid) {
        return sendApiError(res, 401, 'UNAUTHORIZED', 'UID_MISMATCH', req.correlationId);
      }

      // Check authorization: Must either have valid admin PIN OR already have an active matching session
      let isAuthorized = false;
      const cleanInputPin = pin ? cleanPin(pin) : '';
      if (cleanInputPin) {
        const adminPinStored = await getAdminPin();
        if (verifyPinMatch(cleanInputPin, adminPinStored).matches) {
          isAuthorized = true;
          await resetRateLimit(clientIp);
        }
      }

      if (!isAuthorized) {
        const secSnap = await adminDb.doc(`admin_sessions/${effectiveUid}`).get();
        if (secSnap.exists) {
          const sData = secSnap.data() || {};
          if (sData.isActive && sData.sessionId === sessionId) {
            isAuthorized = true;
          }
        }
      }

      if (!isAuthorized) {
        return sendApiError(res, 403, 'FORBIDDEN', 'غير مصرح: يتطلب إدخال الرقم السري', req.correlationId);
      }

      await adminDb.runTransaction(async (transaction) => {
        const entityDocRef = adminDb.doc('admin_settings/auth_pin');
        const secDocRef = adminDb.doc(`admin_sessions/${effectiveUid}`);

        const snap = await transaction.get(entityDocRef);
        if (snap.exists) {
          const data = snap.data() || {};
          const activeSessionId = data.currentSessionId;
          const rawLastActive = data.lastActive;
          const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
          const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
          const isAlive = activeSessionId && activeSessionId !== sessionId && lastActive > 0 && (Date.now() - lastActive < SESSION_TIMEOUT_MS);

          if (isAlive) {
            throw new Error('SESSION_OCCUPIED');
          }
        }

        transaction.set(entityDocRef, {
          currentSessionId: sessionId,
          lastActive: new Date()
        }, { merge: true });

        transaction.set(secDocRef, {
          uid: effectiveUid,
          role: 'admin',
          entityId: 'auth_pin',
          sessionId,
          isActive: true,
          lastActive: new Date(),
          createdAt: new Date()
        }, { merge: true });
      });

      return res.json({ success: true, sessionClaimed: true });
    } catch (e: any) {
      if (e?.message === 'SESSION_OCCUPIED') {
        return res.json({ success: false, error: 'SESSION_OCCUPIED', code: 'CONFLICT' });
      }
      console.error('[Server Auth] Error in claim-admin-session:', e);
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'حدث خطأ في الخادم', req.correlationId);
    }
  });

  // Secure Server API: Validate or Refresh an active session across all roles
  app.post('/api/auth/validate-or-refresh-session', requireFirebaseUser, async (req: AuthRequest, res) => {
    try {
      const { uid, sessionId, role, entityId } = req.body || {};
      if (!uid || !sessionId || !role) {
        return res.status(400).json({ valid: false, error: 'INVALID_PARAMS' });
      }

      if (!adminDb) {
        return res.status(503).json({ valid: false, error: 'DATABASE_UNAVAILABLE' });
      }

      const effectiveUid = req.user?.uid || '';
      if (!effectiveUid) {
        return res.status(401).json({ valid: false, error: 'UNAUTHORIZED: Missing Firebase ID Token' });
      }

      if (typeof uid === 'string' && uid.trim() !== effectiveUid) {
        return res.status(401).json({ valid: false, error: 'UID_MISMATCH' });
      }

      const secCollMap: Record<string, string> = {
        admin: 'admin_sessions',
        supervisor: 'supervisor_sessions',
        delegate: 'delegate_sessions',
        garage: 'garage_sessions',
        staff: 'staff_sessions'
      };
      const entityCollMap: Record<string, string> = {
        admin: 'admin_settings',
        supervisor: 'supervisors',
        delegate: 'delegates',
        garage: 'garages',
        staff: 'staff'
      };

      const secColl = secCollMap[role];
      const entityColl = entityCollMap[role];
      if (!secColl || !entityColl) {
        return res.json({ success: false, valid: false, code: 'INVALID_INPUT', error: 'INVALID_ROLE' });
      }

      const secSnap = await adminDb.doc(`${secColl}/${effectiveUid}`).get();
      if (!secSnap.exists) {
        return res.json({ success: false, valid: false, code: 'NOT_FOUND', error: 'SESSION_NOT_FOUND' });
      }

      const secData = secSnap.data() || {};
      if (!secData.isActive || secData.sessionId !== sessionId) {
        return res.json({ success: false, valid: false, code: 'SESSION_INVALID', error: 'SESSION_INVALID' });
      }

      // Check session expiration timeout (15 minutes of inactivity)
      const rawLastActive = secData.lastActive;
      const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
      const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
      if (lastActive > 0 && (Date.now() - lastActive > SESSION_TIMEOUT_MS)) {
        await adminDb.doc(`${secColl}/${effectiveUid}`).update({ isActive: false }).catch(() => {});
        return res.json({ success: false, valid: false, code: 'SESSION_EXPIRED', error: 'SESSION_EXPIRED' });
      }

      // Check entity level lock: If another session has claimed the entity, this session is revoked
      const targetEntityId = role === 'admin' ? 'auth_pin' : entityId;
      if (targetEntityId) {
        const entitySnap = await adminDb.doc(`${entityColl}/${targetEntityId}`).get();
        if (entitySnap.exists) {
          const entityData = entitySnap.data() || {};
          if (entityData.currentSessionId && entityData.currentSessionId !== sessionId) {
            await adminDb.doc(`${secColl}/${effectiveUid}`).update({ isActive: false }).catch(() => {});
            return res.json({ success: false, valid: false, code: 'SESSION_REVOKED', error: 'SESSION_REVOKED' });
          }
        }
      }

      // Refresh timestamps
      const now = new Date();
      await adminDb.doc(`${secColl}/${effectiveUid}`).set({ lastActive: now }, { merge: true });
      if (targetEntityId) {
        await adminDb.doc(`${entityColl}/${targetEntityId}`).set({ lastActive: now }, { merge: true });
      }

      return res.json({ success: true, valid: true });
    } catch (error) {
      console.error('[Server Auth] Error validating session:', error);
      return res.status(500).json({ success: false, valid: false, code: 'INTERNAL_ERROR', error: 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Release Session (Universal across all roles)
  app.post('/api/auth/release-session', requireFirebaseUser, async (req: AuthRequest, res) => {
    try {
      const { uid, sessionId, role, entityId } = req.body || {};
      const verifiedUid = req.user?.uid || '';

      if (!uid || !sessionId || !role) {
        return sendApiError(res, 400, 'INVALID_INPUT', 'MISSING_PARAMETERS', req.correlationId);
      }

      if (!adminDb) {
        return sendApiError(res, 500, 'SERVICE_UNAVAILABLE', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      if (!verifiedUid) {
        return sendApiError(res, 401, 'UNAUTHORIZED', 'UNAUTHORIZED: Missing token', req.correlationId);
      }

      // Check authorization: caller must release own session or be active admin/supervisor
      let isAuthorized = (verifiedUid === uid);
      if (!isAuthorized) {
        const adminSnap = await adminDb.doc(`admin_sessions/${verifiedUid}`).get();
        const supSnap = await adminDb.doc(`supervisor_sessions/${verifiedUid}`).get();
        if ((adminSnap.exists && adminSnap.data()?.isActive) || (supSnap.exists && supSnap.data()?.isActive)) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return sendApiError(res, 403, 'FORBIDDEN', 'FORBIDDEN: Unauthorized session release', req.correlationId);
      }

      const secCollMap: Record<string, string> = {
        admin: 'admin_sessions',
        supervisor: 'supervisor_sessions',
        delegate: 'delegate_sessions',
        garage: 'garage_sessions',
        staff: 'staff_sessions'
      };
      const entityCollMap: Record<string, string> = {
        admin: 'admin_settings',
        supervisor: 'supervisors',
        delegate: 'delegates',
        garage: 'garages',
        staff: 'staff'
      };

      const secColl = secCollMap[role];
      const entityColl = entityCollMap[role];
      const targetEntityId = role === 'admin' ? 'auth_pin' : entityId;

      if (entityColl && targetEntityId) {
        const entitySnap = await adminDb.doc(`${entityColl}/${targetEntityId}`).get();
        if (entitySnap.exists && entitySnap.data()?.currentSessionId === sessionId) {
          await adminDb.doc(`${entityColl}/${targetEntityId}`).update({
            currentSessionId: null
          });
        }
      }

      if (secColl && uid) {
        const secSnap = await adminDb.doc(`${secColl}/${uid}`).get();
        if (secSnap.exists && secSnap.data()?.sessionId === sessionId) {
          await adminDb.doc(`${secColl}/${uid}`).update({
            isActive: false,
            lastActive: new Date()
          });
        }
      }

      return res.json({ success: true });
    } catch (e) {
      console.error('[Server Auth] Error in release-session:', e);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
  });

  // Admin-only maintenance: invalidate every active login session without changing
  // passwords, account records, vehicles, subscribers, balances, or subscriptions.
  app.post('/api/auth/invalidate-all-sessions', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      if (!adminDb) {
        return res.status(503).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const now = new Date();
      const sessionCollections = [
        { name: 'admin_sessions', entityCollection: 'admin_settings', fixedEntityId: 'auth_pin' },
        { name: 'supervisor_sessions', entityCollection: 'supervisors' },
        { name: 'delegate_sessions', entityCollection: 'delegates' },
        { name: 'garage_sessions', entityCollection: 'garages' },
        { name: 'staff_sessions', entityCollection: 'staff' }
      ];

      const snapshots = await Promise.all(sessionCollections.map((entry) => adminDb.collection(entry.name).get()));
      let invalidatedSessions = 0;
      let clearedEntityMarkers = 0;
      let batch = adminDb.batch();
      let batchWrites = 0;

      const commitBatchIfNeeded = async (force = false) => {
        if (batchWrites > 0 && (force || batchWrites >= 450)) {
          await batch.commit();
          batch = adminDb.batch();
          batchWrites = 0;
        }
      };

      for (let index = 0; index < sessionCollections.length; index += 1) {
        const entry = sessionCollections[index];
        for (const sessionDoc of snapshots[index].docs) {
          const sessionData = sessionDoc.data() || {};
          if (sessionData.isActive === true) invalidatedSessions += 1;
          batch.update(sessionDoc.ref, { isActive: false, lastActive: now });
          batchWrites += 1;

          const entityId = entry.fixedEntityId || sessionData.entityId;
          if (entityId) {
            const entityRef = adminDb.doc(`${entry.entityCollection}/${entityId}`);
            batch.set(entityRef, { currentSessionId: null, lastActive: now }, { merge: true });
            batchWrites += 1;
            clearedEntityMarkers += 1;
          }
          await commitBatchIfNeeded();
        }
      }

      await commitBatchIfNeeded(true);
      return res.json({ success: true, invalidatedSessions, clearedEntityMarkers });
    } catch (e: any) {
      console.error('[Server Auth] Error invalidating all sessions:', e);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Release Admin Session (Backward compatibility)
  app.post('/api/auth/release-admin-session', requireFirebaseUser, async (req: AuthRequest, res) => {
    try {
      const { uid, sessionId } = req.body || {};
      const verifiedUid = req.user?.uid || '';

      if (!uid || !sessionId) {
        return sendApiError(res, 400, 'INVALID_INPUT', 'MISSING_PARAMETERS', req.correlationId);
      }

      if (!adminDb) {
        return sendApiError(res, 500, 'SERVICE_UNAVAILABLE', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      if (!verifiedUid) {
        return sendApiError(res, 401, 'UNAUTHORIZED', 'UNAUTHORIZED: Missing token', req.correlationId);
      }

      if (verifiedUid !== uid) {
        return sendApiError(res, 403, 'FORBIDDEN', 'FORBIDDEN: Caller UID mismatch', req.correlationId);
      }

      const snap = await adminDb.doc('admin_settings/auth_pin').get();
      if (snap.exists && snap.data()?.currentSessionId === sessionId) {
        await adminDb.doc('admin_settings/auth_pin').update({
          currentSessionId: null
        });
      }

      const secSnap = await adminDb.doc(`admin_sessions/${uid}`).get();
      if (secSnap.exists && secSnap.data()?.sessionId === sessionId) {
        await adminDb.doc(`admin_sessions/${uid}`).update({
          isActive: false,
          lastActive: new Date()
        });
      }

      return res.json({ success: true });
    } catch (e) {
      console.error('[Server Auth] Error in release-admin-session:', e);
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Server-Authoritative Garage Package Recharge Engine
  app.post('/api/admin/update-pin', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }

      const { currentPin, newPin } = req.body || {};
      const normNewPin = validateNewPin(newPin, 'newPin');

      // Current PIN is mandatory — verifying it is the entire point of this
      // endpoint being separate from an admin-initiated reset. Do not make this
      // conditional on the field being present; the UI always sends it, but the
      // server must not trust that the client did.
      const normCurrent = cleanPin(currentPin);
      if (!normCurrent) {
        return res.status(400).json({ success: false, error: 'CURRENT_PIN_REQUIRED' });
      }

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const adminStoredPin = await getAdminPin();
      if (!adminStoredPin) {
        return res.status(500).json({ success: false, error: 'ADMIN_PIN_NOT_CONFIGURED' });
      }
      const isMatch = verifyPinMatch(normCurrent, adminStoredPin);
      if (isMatch.matches !== true) {
        return res.status(400).json({ success: false, error: 'CURRENT_PIN_INCORRECT' });
      }

      // Check uniqueness of new PIN
      const pinCheck = await checkPinAvailabilityAcrossAll(normNewPin, 'auth_pin');
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: 'PIN_ALREADY_TAKEN',
          takenBy: { name: pinCheck.name || '', role: pinCheck.role }
        });
      }

      // 1. Save in private_pins
      await saveEntityPin('admin_settings', 'auth_pin', normNewPin);

      // 2. Cleanse legacy plaintext pin from admin_settings/auth_pin
      await adminDb.doc('admin_settings/auth_pin').set({
        pin: null,
        pinLookupHash: null,
        updatedAt: new Date()
      }, { merge: true });

      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Admin] Error in update-pin:', e);
      if (e instanceof ValidationError) {
        return res.status(e.statusCode).json({ success: false, error: `INVALID_NEW_PIN: ${e.message}` });
      }
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
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

      const pkgData = {
        ...req.body,
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
export default app;
