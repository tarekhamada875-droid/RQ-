import express from 'express';
import cors from 'cors';
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
  checkPinAvailabilityAcrossAll,
  calculateVehicleCost
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
  sanitizePayload,
  validateIdempotencyKey,
  ValidationError
} from './validation';
import {
  checkIdempotencyInTransaction,
  storeIdempotencyInTransaction
} from './idempotency';
import {
  initializeFairUse,
  evaluateFairUseCheckIn,
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

  if (errMsg.includes('GARAGE_NOT_FOUND') || errMsg.includes('VEHICLE_NOT_FOUND') || errMsg.includes('REQUEST_NOT_FOUND') || errMsg.includes('PACKAGE_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: 'The requested resource was not found.' };
  }

  if (
    errMsg.includes('REQUEST_ALREADY_PROCESSED') ||
    errMsg.includes('VEHICLE_ALREADY_INSIDE') ||
    errMsg.includes('VEHICLE_ALREADY_OUTSIDE') ||
    errMsg.includes('INSUFFICIENT_BALANCE') ||
    errMsg.includes('CAPACITY_LIMIT_REACHED') ||
    errMsg.includes('FAIR_USE_LIMIT_REACHED') ||
    errMsg.includes('DAILY_DELETION_LIMIT_REACHED') ||
    errMsg.includes('reached_daily_deletion_limit') ||
    errMsg.includes('PIN_ALREADY_TAKEN') ||
    errMsg.includes('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION') ||
    errMsg.includes('NO_REFERRAL_REWARDS_AVAILABLE') ||
    errMsg.includes('SUBSCRIPTION_EXPIRED')
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

  // Health endpoint reporting process readiness without sensitive info
  app.get('/api/health', (_req, res) => {
    const isReady = !!(adminDb && adminAuth);
    if (!isReady) {
      return res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        adminSdk: false
      });
    }
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      adminSdk: true
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
        if (!normInputPin) {
          return res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
        }

        const matches: Array<{
          role: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage';
          id: string;
          account?: any;
          isLegacyMatch?: boolean;
        }> = [];

        // Check Admin PIN
        let adminPinStored = await getAdminPin();
        const adminCheck = verifyPinMatch(normInputPin, adminPinStored);
        if (adminCheck.matches) {
          matches.push({ role: 'admin', id: 'admin', isLegacyMatch: adminCheck.isLegacy });
          if (adminCheck.isLegacy) {
            migratePinToHash('admin_settings', 'auth_pin', normInputPin);
          }
        }

        // Search collections
        const collectionsToCheck: Array<{ name: string; role: 'supervisor' | 'delegate' | 'staff' | 'garage' }> = [
          { name: 'garages', role: 'garage' },
          { name: 'staff', role: 'staff' },
          { name: 'delegates', role: 'delegate' },
          { name: 'supervisors', role: 'supervisor' }
        ];

        for (const coll of collectionsToCheck) {
          try {
            const docs = await queryAccountWherePin(coll.name, normInputPin);
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
          } catch (e) {
            console.error(`[Server Auth] Query error in ${coll.name}:`, e);
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
                const snap = await entityDocRef.get();
                if (snap.exists) {
                  const data = snap.data() || {};
                  const activeSessionId = data.currentSessionId;
                  const rawLastActive = data.lastActive;
                  const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
                  const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
                  const isAlive = activeSessionId && activeSessionId !== sessionId && lastActive > 0 && (Date.now() - lastActive < SESSION_TIMEOUT_MS);

                  if (isAlive) {
                    return res.json({ success: false, error: 'SESSION_OCCUPIED' });
                  }
                }

                // Update entity doc with session lock
                await entityDocRef.set({
                  currentSessionId: sessionId,
                  lastActive: new Date()
                }, { merge: true });

                // Provision security session doc with Admin SDK bypass
                await adminDb.doc(`delegate_sessions/${effectiveUid}`).set({
                  uid: effectiveUid,
                  role: 'delegate',
                  entityId: dDoc.id,
                  sessionId,
                  isActive: true,
                  lastActive: new Date(),
                  createdAt: new Date()
                }, { merge: true });
              } catch (sessErr) {
                console.error('[Server Auth] Error claiming delegate session during phone verification:', sessErr);
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
  app.post('/api/transactions/recharge-garage', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    const ALLOWED_ROLES = ['admin', 'supervisor', 'delegate'];
    if (!ALLOWED_ROLES.includes(req.user?.role || '')) {
      return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_SUPERVISOR_OR_OWNING_DELEGATE_ONLY', req.correlationId);
    }
    try {
      const sanitized = sanitizePayload(req.body, ['garageId', 'packageId', 'adminDetails', 'idempotencyKey'], false);
      const garageId = validateId(sanitized.garageId, 'garageId', true);
      const packageId = validateId(sanitized.packageId, 'packageId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);
      const callerUid = req.user?.uid;
      const callerRole = req.user?.role || '';
      const adminDetails = sanitized.adminDetails || {};

      if (!adminDb) {
        return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      // Delegates may only recharge garages they created or referred
      if (callerRole === 'delegate') {
        const delegateGarageSnap = await adminDb.doc(`garages/${garageId}`).get();
        const delegateGarageData = delegateGarageSnap.exists ? delegateGarageSnap.data() || {} : {};
        const ownsGarage =
          delegateGarageData.createdByDelegateId === req.user?.entityId ||
          delegateGarageData.referrerId === req.user?.entityId;
        if (!ownsGarage) {
          return sendApiError(res, 403, 'GARAGE_SCOPE_MISMATCH', 'GARAGE_SCOPE_MISMATCH', req.correlationId);
        }
      }

      // Package Data Parsing & Sanitization (Server Authoritative)
      const pkgSnap = await adminDb.doc(`packages/${packageId}`).get();
      if (!pkgSnap.exists) {
        return sendApiError(res, 404, 'NOT_FOUND', 'PACKAGE_NOT_FOUND', req.correlationId);
      }
      const packageObj = { id: pkgSnap.id, ...pkgSnap.data() };

      const rawDays = Number(packageObj.durationDays || packageObj.vehiclesCount || 30);
      const durationDays = Math.max(1, Math.min(365, isNaN(rawDays) ? 30 : rawDays));
      const price = Math.max(0, Number(packageObj.price || packageObj.priceAmount || 0));
      const packageName = String(packageObj.name || packageObj.packageName || 'باقة الاشتراك');
      const isUnlimited = Boolean(
        packageObj.isUnlimited ||
        packageName.includes('مفتوح') ||
        packageName.includes('غير محدود') ||
        packageName.includes('بدون حدود')
      );
      const effCapacity = isUnlimited ? 0 : Math.max(1, Number(packageObj.dailyCapacity || packageObj.carsCount || 40));

      let resultData: any = null;

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/recharge-garage', callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }

        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error('GARAGE_NOT_FOUND');
        }

        const garageData = garageSnap.data() || {};

        // Business Guardrail Check: If garage handles monthly subscribers, restrict package duration < 15 days
        if (garageData.hasMonthlySubscribers === true && durationDays < 15) {
          throw new Error('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION');
        }

        let baseDate = new Date();
        const currentExpiry = garageData.balanceExpiry;
        if (currentExpiry) {
          const currentExpDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
          if (!isNaN(currentExpDate.getTime()) && currentExpDate.getTime() > baseDate.getTime()) {
            baseDate = currentExpDate; // Subscription rollover extension
          }
        }
        baseDate.setDate(baseDate.getDate() + durationDays);

        // Referrer Garage reward evaluation
        const referrerGarageId = garageData.referredByGarageId;
        let referrerRef: any = null;
        let referrerSnap: any = null;
        const isEligibleForReferral =
          Boolean(referrerGarageId) &&
          referrerGarageId !== garageId &&
          price > 0 &&
          durationDays > 1;

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

        // Log transaction in activity_logs
        const logRef = adminDb.collection('activity_logs').doc();
        const staffNameText = validateString(adminDetails.staffName, 'staffName', { max: 128 }) || 'مدير النظام (Admin)';
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
            discountAmount: 0,
            rechargedBy: staffNameText
          }
        });

        // Grant Referral Reward if eligible
        if (isEligibleForReferral && referrerRef && referrerSnap && referrerSnap.exists) {
          const referrerData = referrerSnap.data() || {};
          t.set(referrerRef, {
            totalReferralRewardDays: (referrerData.totalReferralRewardDays || 0) + 1,
            totalGaragesReferredCount: (referrerData.totalGaragesReferredCount || 0) + 1,
            lastReferralRewardAt: new Date()
          }, { merge: true });

          const rewardLogRef = adminDb.collection('activity_logs').doc();
          t.set(rewardLogRef, {
            garageId: referrerGarageId,
            garageName: referrerData.name || '',
            staffId: null,
            staffName: 'النظام — مكافأة إحالة',
            actionType: 'recharge',
            plateNumber: `مكافأة إحالة من ${garageData.name || ''} — إضافة يوم مجاني برصيد المكافآت`,
            timestamp: new Date(),
            amount: 0,
            packageId: referrerData.packageId || 'referral_reward',
            details: {
              type: 'referral_reward',
              referrerGarageId: referrerGarageId,
              referredGarageId: garageId
            }
          });
        }

        resultData = {
          newExpiry: baseDate.toISOString(),
          totalAdminRevenue: newRevenue
        };

        // Store idempotency record
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/recharge-garage', callerUid);
      });

      return res.json({ success: true, data: resultData });
    } catch (error: any) {
      console.error('[Server Transaction] Error in recharge-garage:', error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });

  // Secure Server API: Approve Recharge Request
  app.post('/api/transactions/approve-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_OR_SUPERVISOR_ONLY', req.correlationId);
    }
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['requestId', 'request', 'idempotencyKey'], false);
      const reqId = validateId(sanitized.requestId || sanitized.request?.id, 'requestId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      let resultData: any = null;

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/approve-recharge-request', callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }

        const requestRef = adminDb.doc(`recharge_requests/${reqId}`);
        const requestSnap = await t.get(requestRef);
        if (!requestSnap.exists) {
          throw new Error('REQUEST_NOT_FOUND');
        }

        const requestData = requestSnap.data() || {};
        if (requestData.status && requestData.status !== 'pending') {
          throw new Error('REQUEST_ALREADY_PROCESSED');
        }

        const targetGarageId = requestData.garageId || (sanitized.request && sanitized.request.garageId);
        if (!targetGarageId) {
          throw new Error('GARAGE_ID_MISSING');
        }

        const garageRef = adminDb.doc(`garages/${targetGarageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error('GARAGE_NOT_FOUND');
        }

        const garageData = garageSnap.data() || {};

        // System Settings - Always load server authoritative config!
        const globalSettingsSnap = await t.get(adminDb.doc('system_config/global'));
        const legacySettingsSnap = await t.get(adminDb.doc('admin_settings/general'));
        const systemConfig = globalSettingsSnap.exists 
          ? { ...(legacySettingsSnap.exists ? legacySettingsSnap.data() : {}), ...globalSettingsSnap.data() } 
          : (legacySettingsSnap.exists ? legacySettingsSnap.data() : {});

        const delegateMonthlyCommission = Number(
          systemConfig?.delegateMonthlyCommission ?? systemConfig?.referralFeePerRenewal ?? 100
        );

        const subscriberFlatFee = systemConfig?.subscriberFlatFee !== undefined
          ? Math.max(0, Number(systemConfig.subscriberFlatFee))
          : (systemConfig?.monthlySubscribersFlatFee !== undefined ? Number(systemConfig.monthlySubscribersFlatFee) : 500);

        const delegateReferrerId = garageData.referrerId || garageData.createdByDelegateId || null;
        const referredByDelegate = Boolean(delegateReferrerId);

        // Check if this is a balance top-up request
        const isBalanceTopup = requestData.requestType === 'balance_topup' || requestData.packageId === 'balance_topup';

        if (isBalanceTopup) {
          const topupAmount = Number(requestData.amount || requestData.revenueAmount || 0);
          const currentBalance = Number(garageData.balance || 0);
          const newGarageBalance = currentBalance + topupAmount;

          const targetDelegateId = delegateReferrerId || requestData.delegateId || null;
          let delegateRef: any = null;
          let delegateSnap: any = null;
          if (targetDelegateId) {
            delegateRef = adminDb.doc(`delegates/${targetDelegateId}`);
            delegateSnap = await t.get(delegateRef);
          }

          // Update Garage balance
          t.set(garageRef, {
            balance: newGarageBalance,
            totalAdminRevenue: (garageData.totalAdminRevenue || 0) + topupAmount,
            lastRechargeDate: new Date(),
            lastRechargeAmount: topupAmount,
            lastRechargePackageName: `شحن رصيد محفظة (${topupAmount} ج.م)`
          }, { merge: true });

          // Update Request
          t.set(requestRef, {
            status: 'approved',
            amount: topupAmount,
            revenueAmount: topupAmount,
            originalRevenueAmount: topupAmount,
            resolvedAt: new Date()
          }, { merge: true });

          // Update Delegate stats
          if (delegateRef && delegateSnap && delegateSnap.exists) {
            const delData = delegateSnap.data() || {};
            t.set(delegateRef, {
              totalRechargedAmount: (delData.totalRechargedAmount || 0) + topupAmount
            }, { merge: true });
          }

          // Log Activity
          const logRef = adminDb.collection('activity_logs').doc();
          t.set(logRef, {
            garageId: targetGarageId,
            garageName: requestData.garageName || garageData.name || '',
            staffId: delegateReferrerId || requestData.delegateId || null,
            staffName: requestData.delegateName || null,
            actionType: 'balance_topup',
            plateNumber: `شحن رصيد محفظة (${topupAmount} ج.م)`,
            timestamp: new Date(),
            amount: topupAmount,
            details: {
              action: 'balance_topup',
              amount: topupAmount,
              previousBalance: currentBalance,
              newBalance: newGarageBalance,
              delegateId: requestData.delegateId || null,
              delegateName: requestData.delegateName || null,
              requestId: reqId
            }
          });

          resultData = {
            requestId: reqId,
            status: 'approved',
            newBalance: newGarageBalance,
            revenue: topupAmount
          };
        } else {
          // Package Price Calculation from Package Doc (Server Authoritative)
          const rawPackageData = requestData.packageData || {};
          let basePrice = Number(rawPackageData.price || rawPackageData.priceAmount || requestData.amount || 0);
          let durationDays = Number(requestData.durationDays || requestData.carsCount || 30);
          let pkgName = String(requestData.packageName || rawPackageData.name || 'باقة الاشتراك');
          let isUnlimitedPkg =
            pkgName.includes('مفتوح') ||
            pkgName.includes('غير محدود') ||
            pkgName.includes('غير محدودة') ||
            pkgName.includes('بدون حدود') ||
            pkgName.includes('سعة مفتوحة');
          let effCapacity = isUnlimitedPkg ? 0 : Math.max(1, Number(requestData.dailyCapacity || 40));

          if (requestData.packageId) {
            const pkgRef = adminDb.doc(`packages/${requestData.packageId}`);
            const pkgSnap = await t.get(pkgRef);
            if (pkgSnap.exists) {
              const pData = pkgSnap.data() || {};
              if (pData.price !== undefined) {
                basePrice = Number(pData.price);
              }
              if (pData.durationDays !== undefined) {
                durationDays = Number(pData.durationDays);
              }
              if (pData.dailyCapacity !== undefined) {
                effCapacity = pData.isUnlimited ? 0 : Number(pData.dailyCapacity);
              }
              if (pData.name) {
                pkgName = String(pData.name);
              }
            }
          }

          // Delegate Doc Check & Monthly Qualification
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

            if (!alreadyPaid && (durationDays >= 30 || newDaysPurchased >= 10)) {
              commission = delegateMonthlyCommission > 0 ? delegateMonthlyCommission : 100;
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
          const discountAmount = Number(requestData.discountAmount || 0);
          let effectiveRevenue = Math.max(0, basePrice - discountAmount);
          if (garageData.hasMonthlySubscribers === true) {
            effectiveRevenue += subscriberFlatFee;
          }

          // Expiry Calculation
          let baseDate = new Date();
          const currentExpiry = garageData.balanceExpiry;
          if (currentExpiry) {
            const expDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
            if (!isNaN(expDate.getTime()) && expDate.getTime() > baseDate.getTime()) {
              baseDate = expDate;
            }
          }
          baseDate.setDate(baseDate.getDate() + durationDays);

          // Update Garage
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

          // Update Request
          t.set(requestRef, {
            status: 'approved',
            commission: commission,
            referrerId: delegateReferrerId,
            amount: effectiveRevenue,
            revenueAmount: effectiveRevenue,
            originalRevenueAmount: effectiveOriginalRevenue,
            resolvedAt: new Date()
          }, { merge: true });

          // Update Delegate
          if (delegateRef && delegateSnap && delegateSnap.exists) {
            const delData = delegateSnap.data() || {};
            t.set(delegateRef, {
              totalRechargedAmount: (delData.totalRechargedAmount || 0) + effectiveRevenue,
              totalCommissionEarned: (delData.totalCommissionEarned || 0) + commission
            }, { merge: true });
          }

          // Log Activity
          const logRef = adminDb.collection('activity_logs').doc();
          t.set(logRef, {
            garageId: targetGarageId,
            garageName: requestData.garageName || garageData.name || '',
            staffId: delegateReferrerId || requestData.delegateId || null,
            staffName: requestData.delegateName || null,
            actionType: 'recharge',
            plateNumber: `شحن ${requestData.packageName || 'الباقة'} (${durationDays} يوم - ${effCapacity === 0 ? 'مفتوح' : `${effCapacity} سيارة`})`,
            timestamp: new Date(),
            amount: effectiveRevenue,
            packageId: requestData.packageId || null,
            details: {
              packageName: requestData.packageName,
              durationDays,
              carsCount: effCapacity,
              revenueAmount: effectiveRevenue,
              commission: commission,
              requestId: reqId
            }
          });

          resultData = {
            requestId: reqId,
            status: 'approved',
            newExpiry: baseDate.toISOString(),
            revenue: effectiveRevenue,
            commission
          };
        }

        // Store idempotency record
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid);
      });

      return res.json({ success: true, data: resultData });
    } catch (error: any) {
      console.error('[Server Transaction] Error in approve-recharge-request:', error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });

  // Secure Server API: Reject Recharge Request
  app.post('/api/transactions/reject-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_OR_SUPERVISOR_ONLY', req.correlationId);
    }
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['requestId', 'idempotencyKey'], false);
      const requestId = validateId(sanitized.requestId, 'requestId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/reject-recharge-request', callerUid);
        if (isDuplicate) {
          return;
        }

        const requestRef = adminDb.doc(`recharge_requests/${requestId}`);
        const requestSnap = await t.get(requestRef);
        if (!requestSnap.exists) {
          throw new Error('REQUEST_NOT_FOUND');
        }

        const currentStatus = requestSnap.data()?.status;
        if (currentStatus && currentStatus !== 'pending') {
          throw new Error('REQUEST_ALREADY_PROCESSED');
        }

        t.set(requestRef, {
          status: 'rejected',
          resolvedAt: new Date()
        }, { merge: true });

        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/transactions/reject-recharge-request', callerUid);
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error('[Server Transaction] Error in reject-recharge-request:', error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });

  // Secure Server API: Admin Direct Balance Top-Up
  app.post('/api/transactions/admin-topup-balance', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    if (req.user?.role !== 'admin') {
      return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
    }
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['garageId', 'amount', 'idempotencyKey'], false);
      const garageId = validateId(sanitized.garageId, 'garageId', true);
      const numAmount = validateNumber(sanitized.amount, 'amount', { min: 1, max: 1000000, integerOnly: true });
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      let resultData: any = null;

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/admin-topup-balance', callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }

        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error('GARAGE_NOT_FOUND');
        }

        const garageData = garageSnap.data() || {};
        const currentBalance = Number(garageData.balance || 0);
        const newBalance = currentBalance + numAmount;

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
          amount: numAmount,
          details: {
            action: 'admin_balance_topup',
            amount: numAmount,
            previousBalance: currentBalance,
            newBalance
          }
        });

        resultData = { garageId, newBalance, addedAmount: numAmount };

        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/admin-topup-balance', callerUid);
      });

      return res.json({ success: true, data: resultData });
    } catch (error: any) {
      console.error('[Server Transaction] Error in admin-topup-balance:', error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });

  // Secure Server API: Garage Self-Service Subscription Using Balance
  app.post('/api/transactions/garage-self-subscribe', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    const userRole = req.user?.role;
    const userGarageId = req.user?.garageId || req.user?.entityId;
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['garageId', 'packageId', 'packageData', 'idempotencyKey'], false);
      const bodyGarageId = validateId(sanitized.garageId, 'garageId', false);
      const packageId = validateId(sanitized.packageId, 'packageId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      const garageId = userRole === 'garage' ? userGarageId : (bodyGarageId || userGarageId);
      if (userRole === 'garage' && userGarageId && bodyGarageId && userGarageId !== bodyGarageId) {
        return sendApiError(res, 403, 'FORBIDDEN', 'UNAUTHORIZED_GARAGE_ACCESS', req.correlationId);
      }
      if (!['garage', 'admin', 'supervisor'].includes(userRole || '')) {
        return sendApiError(res, 403, 'FORBIDDEN', 'FORBIDDEN: Role not authorized for self subscribe', req.correlationId);
      }
      if (!garageId) {
        return sendApiError(res, 400, 'INVALID_INPUT', 'GARAGE_ID_REQUIRED', req.correlationId);
      }
      if (!adminDb) {
        return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      let resultData: any = null;

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/garage-self-subscribe', callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }

        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error('GARAGE_NOT_FOUND');
        }

        const garageData = garageSnap.data() || {};
        const currentBalance = Number(garageData.balance || 0);

        // System config for subscriber flat fee
        const settingsSnap = await t.get(adminDb.doc('system_config/global'));
        const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};
        const subscriberFlatFee = systemConfig?.subscriberFlatFee !== undefined
          ? Math.max(0, Number(systemConfig.subscriberFlatFee))
          : (systemConfig?.monthlySubscribersFlatFee !== undefined ? Number(systemConfig.monthlySubscribersFlatFee) : 500);

        // Standard default packages mapping
        const DEFAULT_PACKAGES_MAP: Record<string, { id: string; name: string; price: number; durationDays: number; dailyCapacity: number; isUnlimited?: boolean }> = {
          daily_30: { id: 'daily_30', name: 'باقة 30 سيارة/يوم', price: 15, durationDays: 1, dailyCapacity: 30 },
          daily_50: { id: 'daily_50', name: 'باقة 50 سيارة/يوم', price: 25, durationDays: 1, dailyCapacity: 50 },
          daily_unlimited: { id: 'daily_unlimited', name: 'باقة سعة مفتوحة', price: 40, durationDays: 1, dailyCapacity: 0, isUnlimited: true },
          biweekly_30: { id: 'biweekly_30', name: 'باقة 30 سيارة/يوم', price: 120, durationDays: 15, dailyCapacity: 30 },
          biweekly_50: { id: 'biweekly_50', name: 'باقة 50 سيارة/يوم', price: 180, durationDays: 15, dailyCapacity: 50 },
          biweekly_unlimited: { id: 'biweekly_unlimited', name: 'باقة سعة مفتوحة', price: 280, durationDays: 15, dailyCapacity: 0, isUnlimited: true },
          monthly_30: { id: 'monthly_30', name: 'باقة 30 سيارة/يوم', price: 200, durationDays: 30, dailyCapacity: 30 },
          monthly_50: { id: 'monthly_50', name: 'باقة 50 سيارة/يوم', price: 300, durationDays: 30, dailyCapacity: 50 },
          monthly_unlimited: { id: 'monthly_unlimited', name: 'باقة سعة مفتوحة', price: 450, durationDays: 30, dailyCapacity: 0, isUnlimited: true }
        };

        // Resolve package info from Firestore collection, or fallback to default packages / request packageData
        let pkg: any = null;
        if (packageId) {
          const pkgRef = adminDb.doc(`packages/${packageId}`);
          const pkgSnap = await t.get(pkgRef);
          if (pkgSnap.exists) {
            pkg = { id: pkgSnap.id, ...pkgSnap.data() };
          } else if (DEFAULT_PACKAGES_MAP[packageId]) {
            pkg = { ...DEFAULT_PACKAGES_MAP[packageId] };
          } else if (sanitized.packageData && typeof sanitized.packageData === 'object') {
            pkg = { id: packageId, ...sanitized.packageData };
          }
        }

        if (!pkg) {
          throw new Error('PACKAGE_NOT_FOUND');
        }

        const durationDays = Number(pkg.durationDays || pkg.vehiclesCount || 30);
        let basePrice = Number(pkg.price || 0);

        // Calculate discount if applicable
        let discountAmount = 0;
        if (pkg.discountType === 'percentage' && pkg.discountValue > 0) {
          discountAmount = Math.round((basePrice * Number(pkg.discountValue)) / 100);
        } else if (pkg.discountType === 'fixed' && pkg.discountValue > 0) {
          discountAmount = Math.min(basePrice, Number(pkg.discountValue));
        }

        let effectivePrice = Math.max(0, basePrice - discountAmount);
        if (garageData.hasMonthlySubscribers === true) {
          effectivePrice += subscriberFlatFee;
        }

        if (currentBalance < effectivePrice) {
          throw new Error(`INSUFFICIENT_BALANCE: الرصيد المتاح (${currentBalance} ج.م) غير كافٍ للاشتراك في هذه الباقة (${effectivePrice} ج.م)`);
        }

        const newBalance = currentBalance - effectivePrice;

        // Calculate new expiry
        let baseDate = new Date();
        const currentExpiry = garageData.balanceExpiry;
        if (currentExpiry) {
          const expDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
          if (!isNaN(expDate.getTime()) && expDate.getTime() > baseDate.getTime()) {
            baseDate = expDate;
          }
        }
        baseDate.setDate(baseDate.getDate() + durationDays);

        const pkgName = String(pkg.name || 'باقة اشتراك');
        const isUnlimitedPkg =
          pkgName.includes('مفتوح') ||
          pkgName.includes('غير محدود') ||
          pkgName.includes('غير محدودة') ||
          pkgName.includes('بدون حدود') ||
          pkgName.includes('سعة مفتوحة') ||
          pkg.dailyCapacity === 0;

        const effCapacity = isUnlimitedPkg ? 0 : Math.max(1, Number(pkg.dailyCapacity || 40));

        // Update Garage
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

        // Log Activity
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

        resultData = {
          garageId,
          newBalance,
          newExpiry: baseDate.toISOString(),
          packageName: pkgName,
          deductedAmount: effectivePrice
        };

        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/garage-self-subscribe', callerUid);
      });

      return res.json({ success: true, data: resultData });
    } catch (error: any) {
      console.error('[Server Transaction] Error in garage-self-subscribe:', error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });

  
  // Secure Server API: Vehicle Check-In
  app.post('/api/vehicles/check-in', requireAuth, async (req: AuthRequest, res: any) => {
    const requestStartedAt = Date.now();
    try {
      const { garageId: bodyGarageId, plateNumber, plateRaw, type } = req.body || {};
      const callerRole = req.user?.role;
      let garageId = '';

      if (callerRole === 'garage' || callerRole === 'staff') {
        if (!req.user?.garageId) {
          return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' });
        }
        if (bodyGarageId && bodyGarageId !== req.user.garageId) {
          return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
        }
        garageId = req.user.garageId;
      } else if (callerRole === 'admin') {
        garageId = bodyGarageId;
      } else {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' });
      }

      const staffId = req.user?.uid;
      
      if (!garageId || !plateNumber || !plateRaw) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      // Get Cairo date key helper inline
      const getCairoDateKey = () => {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      };

      const today = getCairoDateKey();

      // Server-authoritative subscriber verification (anti-bypass).
      // Run both compatibility lookups in parallel instead of sequentially.
      let isSubscriberAuthoritative = false;
      try {
        const subscriberCollection = adminDb.collection(`garages/${garageId}/subscribers`);
        const [subSnapRaw, subSnapPlate] = await Promise.all([
          subscriberCollection.where('plateNumberRaw', '==', plateRaw).get(),
          subscriberCollection.where('plateNumber', '==', plateNumber).get(),
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
        console.warn('[Server Check-In] Subscriber lookup warning:', subErr);
      }

      let resultData: Record<string, any> = {};
      await adminDb.runTransaction(async (t: any) => {
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

        // Authoritative staff name resolution
        const resolvedStaffName = req.user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));
        
        // Subscription check
        const expDateRaw = garageData.balanceExpiry;
        if (!expDateRaw) throw new Error('SUBSCRIPTION_EXPIRED');
        const expDate = expDateRaw.toDate ? expDateRaw.toDate() : new Date(expDateRaw);
        if (isNaN(expDate.getTime()) || expDate.getTime() < Date.now()) {
           throw new Error('SUBSCRIPTION_EXPIRED');
        }

        // Compute the day rollover FIRST — todayCount from a previous day is stale
        // and must not be used against today's capacity limit.
        const isNewDay = garageData.lastTransactionDate !== today;

        // Capacity check
        const capacity = Number(garageData.dailyCapacity || 0);
        const used = isNewDay ? 0 : Number(garageData.todayCount || 0);
        const isUnlimited = capacity === 0 || String(garageData.activePackageName || '').includes('مفتوح');
        
        let updatedFairUse: any = null;
        let didAutoExtend = false;

        if (isUnlimited) {
          const evalResult = evaluateFairUseCheckIn(
            garageData.unlimitedFairUse,
            garageData.durationDays || 30,
            garageData.activePackageName || ''
          );
          if (!evalResult.allowed) {
            throw new Error('FAIR_USE_LIMIT_REACHED');
          }
          updatedFairUse = evalResult.updatedFairUse;
          didAutoExtend = evalResult.autoExtended;
        } else if (used >= capacity) {
          throw new Error('CAPACITY_LIMIT_REACHED');
        }

        if (vehicleSnap.exists && vehicleSnap.data()?.status === 'inside') {
          throw new Error('VEHICLE_ALREADY_INSIDE');
        }
        
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
          enteredByUid: req.user?.uid || null
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
            isSubscriber: isSubscriberAuthoritative,
          },
          carsInside: Number(garageUpdate.carsInside || 0),
          dailyCount: Number(garageUpdate.todayCount || 0),
          dailyCapacity: isUnlimited ? 0 : capacity,
        };
      });

      const durationMs = Date.now() - requestStartedAt;
      res.setHeader('Server-Timing', `check-in;dur=${durationMs}`);
      console.info('[Server Check-In] completed', {
        correlationId: req.correlationId,
        durationMs,
        garageId,
        isSubscriber: isSubscriberAuthoritative,
      });
      return res.json({ success: true, data: resultData });
    } catch (err: any) {
      console.error('[Server] Check-in error:', err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Vehicle Check-Out
  app.post('/api/vehicles/check-out', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId: bodyGarageId, vehicleId } = req.body || {};
      const callerRole = req.user?.role;
      let garageId = '';

      if (callerRole === 'garage' || callerRole === 'staff') {
        if (!req.user?.garageId) {
          return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' });
        }
        if (bodyGarageId && bodyGarageId !== req.user.garageId) {
          return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
        }
        garageId = req.user.garageId;
      } else if (callerRole === 'admin') {
        garageId = bodyGarageId;
      } else {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' });
      }

      const staffId = req.user?.uid;
      
      if (!garageId || !vehicleId) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      let finalCost = 0;

      await adminDb.runTransaction(async (t: any) => {
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
        const today = getCairoDateKey();
        const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);

        const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);

        if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
        if (!vehicleSnap.exists) throw new Error('VEHICLE_NOT_FOUND');

        const garageData = garageSnap.data() || {};
        const vehicleData = vehicleSnap.data() || {};

        // Authoritative staff name resolution
        const resolvedStaffName = req.user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));

        if (vehicleData.status === 'outside') {
          throw new Error('VEHICLE_ALREADY_OUTSIDE');
        }

        // Server-authoritative cost calculation (type-aware: hourly vs overnight)
        const cost = calculateVehicleCost(vehicleData, garageData);
        finalCost = cost;

        t.set(vehicleRef, {
          status: 'outside',
          exitTime: new Date(),
          totalCost: cost
        }, { merge: true });

        const isNewDay = garageData.lastTransactionDate !== today;
        
        t.set(garageRef, {
          totalRevenue: (garageData.totalRevenue || 0) + cost,
          totalVehiclesOut: (garageData.totalVehiclesOut || 0) + 1,
          todayRevenue: isNewDay ? cost : (garageData.todayRevenue || 0) + cost,
          todayCount: isNewDay ? 0 : (garageData.todayCount || 0),
          lastTransactionDate: today,
          carsInside: Math.max(0, (garageData.carsInside || 0) - 1)
        }, { merge: true });

        if (!dailyStatsSnap.exists) {
          t.set(dailyStatsRef, {
            dateId: today,
            count: 0,
            revenue: cost,
            createdAt: new Date()
          });
        } else {
          t.set(dailyStatsRef, { revenue: (dailyStatsSnap.data()?.revenue || 0) + cost }, { merge: true });
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
          amount: cost
        });
      });

      return res.json({ success: true, data: { cost: finalCost } });
    } catch (err: any) {
      console.error('[Server] Check-out error:', err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Vehicle Delete
  app.post('/api/vehicles/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId: bodyGarageId, vehicleId, refundAmount } = req.body || {};
      const callerRole = req.user?.role;
      let garageId = '';

      if (callerRole === 'garage' || callerRole === 'staff') {
        if (!req.user?.garageId) {
          return res.status(403).json({ success: false, error: 'FORBIDDEN: Garage ID missing in session' });
        }
        if (bodyGarageId && bodyGarageId !== req.user.garageId) {
          return res.status(403).json({ success: false, error: 'GARAGE_SCOPE_MISMATCH' });
        }
        garageId = req.user.garageId;
      } else if (callerRole === 'admin') {
        garageId = bodyGarageId;
      } else {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Role not authorized for vehicle operations' });
      }

      const staffId = req.user?.uid;
      
      if (!garageId || !vehicleId) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const getCairoDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

      await adminDb.runTransaction(async (t: any) => {
        const todayYMD = getCairoDateKey();
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
        const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${todayYMD}`);

        const [garageDoc, vehicleDoc, dailyStatsDoc] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);

        if (!garageDoc.exists) throw new Error('GARAGE_NOT_FOUND');
        if (!vehicleDoc.exists) throw new Error('VEHICLE_NOT_FOUND');
        
        const garageData = garageDoc.data() || {};
        const vehicleData = vehicleDoc.data() || {};
        
        // Authoritative staff name resolution
        const resolvedStaffName = req.user?.displayName || (callerRole === 'admin' ? 'مدير النظام' : (callerRole === 'garage' ? (garageData.name || 'مدير الجراج') : 'موظف'));

        // Entrant identity verification: only the staff member who entered the vehicle or an Admin can delete/correct it
        if (callerRole !== 'admin') {
          const entrantUid = vehicleData.enteredByUid || vehicleData.staffUid || vehicleData.staffId;
          const callerUid = req.user?.uid;
          const callerEntityId = req.user?.entityId;
          
          if (entrantUid && entrantUid !== callerUid && entrantUid !== callerEntityId) {
            throw new Error('CORRECTION_FORBIDDEN: Only the staff member who entered the vehicle can correct or delete it');
          }
        }

        // Deletion limit logic
        const todayDeletions = garageData.lastDeletionDate === todayYMD ? (garageData.dailyDeletionCount || 0) : 0;
        if (todayDeletions >= 3 && callerRole !== 'admin') {
          throw new Error('reached_daily_deletion_limit');
        }

        const isSameRefundDay = garageData.lastRefundDate === todayYMD;
        // Strict refund validation: refund amount cannot exceed actual fee recorded for this vehicle,
        // and cannot be refunded if the vehicle was only inside (unpaid entry).
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
          isLocked: false,
          dailyDeletionCount: todayDeletions + 1,
          lastDeletionDate: todayYMD,
          dailyRefundCount: isSameRefundDay ? ((garageData.dailyRefundCount || 0) + 1) : 1,
          lastRefundDate: todayYMD
        };

        if (refundAmt > 0) updates.balance = (garageData.balance || 0) + refundAmt;
        if (vehicleData.status === 'inside') updates.carsInside = Math.max(0, (garageData.carsInside || 0) - 1);
        if (enteredToday) updates.todayCount = Math.max(0, (garageData.todayCount || 0) - 1);

        t.set(garageRef, updates, { merge: true });

        if (enteredToday && dailyStatsDoc.exists) {
          const prevCount = dailyStatsDoc.data()?.count || 0;
          if (prevCount > 0) t.set(dailyStatsRef, { count: prevCount - 1 }, { merge: true });
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
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Server] Delete error:', err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Admin Update PIN
  app.post('/api/admin/update-pin', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }

      const { currentPin, newPin } = req.body || {};
      const normNewPin = cleanPin(newPin);
      if (!normNewPin || normNewPin.length < 4 || normNewPin.length > 6) {
        return res.status(400).json({ success: false, error: 'INVALID_NEW_PIN: PIN must be 4 to 6 digits' });
      }

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
      return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Admin Update System Config (General Settings & Wallet Number)
  app.post('/api/admin/update-system-config', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin or Supervisor role required' });
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
  app.post('/api/garages/create', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    try {
      const callerRole = req.user?.role;
      const callerUid = req.user?.uid;
      const callerName = req.user?.displayName || '';

      if (!callerRole || !['admin', 'supervisor', 'delegate'].includes(callerRole)) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Creation not permitted for role' });
      }

      const sanitized = sanitizePayload(req.body, ['name', 'phone', 'hourlyRate', 'overnightRate', 'pin', 'billingModel', 'isTrial', 'trialDays', 'defaultTrialDays', 'dailyCapacity', 'initialPackageId', 'packages', 'createdByDelegateId', 'createdByDelegateName', 'referrerId', 'referrerName', 'referredByGarageId', 'referredByGarageName', 'idempotencyKey'], false);

      const name = validateString(sanitized.name, 'name', { min: 2, max: 100, required: true })!;
      const normPin = cleanPin(sanitized.pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: 'INVALID_PIN: PIN must be 4-10 digits' });
      }

      validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      // Check PIN availability
      const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: 'PIN_ALREADY_TAKEN',
          takenBy: { name: pinCheck.name || '', role: pinCheck.role }
        });
      }

      const isTrial = sanitized.isTrial !== undefined ? Boolean(sanitized.isTrial) : true;
      const rawTrialDays = sanitized.trialDays !== undefined ? sanitized.trialDays : sanitized.defaultTrialDays;
      const trialDays = rawTrialDays !== undefined
        ? validateNumber(rawTrialDays, 'trialDays', { min: 1, max: 365, required: false })
        : 15;
      const now = new Date();

      let balanceExpiry: Date;
      let dailyCapacity: number;
      let activePackageName: string;

      if (isTrial) {
        balanceExpiry = new Date(now.getTime() + (trialDays > 0 ? trialDays : 15) * 24 * 60 * 60 * 1000);
        dailyCapacity = sanitized.dailyCapacity !== undefined
          ? validateNumber(sanitized.dailyCapacity, 'dailyCapacity', { min: 0, max: 10000, required: false })
          : 40;
        activePackageName = `الباقة التجريبية (${trialDays} يوم)`;
      } else {
        balanceExpiry = new Date(now.getTime() - 1000);
        dailyCapacity = 0;
        activePackageName = 'بدون باقة';
      }

      const garageRef = adminDb.collection('garages').doc();
      const garageId = garageRef.id;

      // Save credentials exclusively to secure private_pins collection
      await saveEntityPin('garages', garageId, normPin);

      const garageDoc: any = {
        name: name.trim(),
        phone: sanitized.phone ? String(sanitized.phone).trim() : '',
        hourlyRate: sanitized.hourlyRate !== undefined ? validateNumber(sanitized.hourlyRate, 'hourlyRate', { min: 0, max: 10000, required: false }) : 0,
        overnightRate: sanitized.overnightRate !== undefined ? validateNumber(sanitized.overnightRate, 'overnightRate', { min: 0, max: 10000, required: false }) : 0,
        billingModel: ['subscription', 'trial'].includes(sanitized.billingModel) ? sanitized.billingModel : 'subscription',
        status: (callerRole === 'delegate' || sanitized.createdByDelegateId || sanitized.isPending) ? 'pending' : 'approved',
        hasMonthlySubscribers: false,
        createdAt: now,
        isTrial,
        dailyCapacity,
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
        const delegateEntityId = req.user?.entityId || callerUid;
        garageDoc.createdByDelegateId = delegateEntityId;
        garageDoc.createdByDelegateName = sanitized.createdByDelegateName || callerName || 'المندوب';
        garageDoc.referrerId = delegateEntityId;
        garageDoc.referrerName = sanitized.referrerName || sanitized.createdByDelegateName || callerName || 'المندوب';
      } else if (sanitized.createdByDelegateId) {
        garageDoc.createdByDelegateId = sanitized.createdByDelegateId;
        garageDoc.createdByDelegateName = sanitized.createdByDelegateName || 'المندوب';
        garageDoc.referrerId = sanitized.referrerId || sanitized.createdByDelegateId;
        garageDoc.referrerName = sanitized.referrerName || sanitized.createdByDelegateName || 'المندوب';
      }

      if (sanitized.referredByGarageId) {
        garageDoc.referredByGarageId = sanitized.referredByGarageId;
        garageDoc.referredByGarageName = sanitized.referredByGarageName || '';
      }

      await garageRef.set(garageDoc);

      // Create initial activity log
      const logRef = adminDb.collection('activity_logs').doc();
      await logRef.set({
        garageId,
        garageName: garageDoc.name,
        staffId: callerUid || null,
        staffName: callerName || (isTrial ? 'النظام (تفعيل تجريبي)' : 'الإدارة (إنشاء جراج)'),
        actionType: isTrial ? 'recharge' : 'create',
        plateNumber: isTrial
          ? `تفعيل الباقة التجريبية (${trialDays} يوم)`
          : `إنشاء حساب جراج جديد (بدون باقة)`,
        timestamp: now,
        amount: 0,
        details: {
          packageName: isTrial ? `الباقة التجريبية (${trialDays} يوم)` : activePackageName,
          durationDays: isTrial ? trialDays : 0,
          carsCount: dailyCapacity,
          revenueAmount: 0,
          isTrial: Boolean(isTrial)
        }
      });

      return res.json({ success: true, id: garageId });
    } catch (e: any) {
      console.error('[Server Garage] Error in create garage:', e);
      const { statusCode, message } = mapDomainErrorToStatus(e);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Create Supervisor (Admin Only)
  app.post('/api/supervisors/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { name, phone, pin, permissions } = req.body || {};
      const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
      const normPin = cleanPin(pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: 'INVALID_PIN: PIN must be 4-10 digits' });
      }

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
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Create Delegate (Admin Only)
  app.post('/api/delegates/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
      }
      const { name, phone, pin, commissionRate, commissions, defaultTrialDays } = req.body || {};
      const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
      const normPhone = phone ? String(phone).trim() : '';
      const normPin = cleanPin(pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: 'INVALID_PIN: PIN must be 4-10 digits' });
      }

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

      const delRef = adminDb.collection('delegates').doc();
      const delId = delRef.id;

      await saveEntityPin('delegates', delId, normPin);

      await delRef.set({
        name: normName.trim(),
        phone: normPhone,
        commissionRate: commissionRate !== undefined ? Number(commissionRate) : 10,
        commissions: commissions || { daily: 5, weekly: 15, biweekly: 25, monthly: 50 },
        defaultTrialDays: defaultTrialDays !== undefined ? Number(defaultTrialDays) : 15,
        balance: 0,
        totalEarned: 0,
        createdAt: new Date()
      });

      return res.json({ success: true, id: delId });
    } catch (e: any) {
      console.error('[Server Delegate] Error in create:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Create Staff Member
  app.post('/api/staff/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { name, phone, pin, garageId, role, permissions } = req.body || {};
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      if (callerRole !== 'admin' && callerRole !== 'supervisor' && (!callerGarageId || callerGarageId !== garageId)) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot add staff to this garage' });
      }

      const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
      const normPin = cleanPin(pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: 'INVALID_PIN: PIN must be 4-10 digits' });
      }

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

      const normNewPin = cleanPin(newPin);
      if (!normNewPin || normNewPin.length < 4 || normNewPin.length > 10) {
        return res.status(400).json({ success: false, error: 'INVALID_NEW_PIN: PIN must be 4 to 10 digits' });
      }

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      // Verify Authorization
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
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Garage Referral Reward Claim
  app.post('/api/transactions/use-referral-reward', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    try {
      const sanitized = sanitizePayload(req.body, ['garageId', 'idempotencyKey'], false);
      const garageId = validateId(sanitized.garageId, 'garageId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      const callerUid = req.user?.uid;
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      // Only garage owner of this garage, admin, or supervisor can claim
      if (callerRole === 'garage' && callerGarageId !== garageId) {
        return sendApiError(res, 403, 'FORBIDDEN', 'FORBIDDEN: Cannot claim reward for another garage', req.correlationId);
      }
      if (callerRole === 'staff') {
        return sendApiError(res, 403, 'FORBIDDEN', 'FORBIDDEN: Staff cannot claim referral rewards', req.correlationId);
      }

      if (!adminDb) {
        return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
      }

      let claimedDays = 0;
      await adminDb.runTransaction(async (t) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/use-referral-reward', callerUid);
        if (isDuplicate) {
          claimedDays = cachedResult?.daysClaimed || 0;
          return;
        }

        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error('GARAGE_NOT_FOUND');
        }

        const garageData = garageSnap.data() || {};
        const rewardDays = Math.max(0, Number(garageData.totalReferralRewardDays || 0));
        if (rewardDays <= 0) {
          throw new Error('NO_REFERRAL_REWARDS_AVAILABLE');
        }

        claimedDays = rewardDays;
        let baseDate = new Date();
        const currentExpiry = garageData.balanceExpiry;
        if (currentExpiry) {
          const expDate = currentExpiry.toDate ? currentExpiry.toDate() : new Date(currentExpiry);
          if (expDate > baseDate) {
            baseDate = expDate;
          }
        }

        baseDate.setDate(baseDate.getDate() + rewardDays);

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
          details: {
            type: 'use_referral_reward',
            claimedDays: rewardDays,
            newExpiry: baseDate.toISOString()
          }
        });

        storeIdempotencyInTransaction(t, idempotencyKey, { daysClaimed: claimedDays }, '/api/transactions/use-referral-reward', callerUid);
      });

      return res.json({ success: true, daysClaimed: claimedDays });
    } catch (e: any) {
      console.error('[Server Reward] Error in use-referral-reward:', e);
      const { statusCode, code, message } = mapDomainErrorToStatus(e);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });

  // Secure Server API: Garage Deletion
  app.post('/api/garages/delete', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    try {
      const callerRole = req.user?.role;
      if (!callerRole || !['admin', 'supervisor'].includes(callerRole)) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin or Supervisor role required' });
      }

      const sanitized = sanitizePayload(req.body, ['garageId', 'idempotencyKey'], false);
      const garageId = validateId(sanitized.garageId, 'garageId', true);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await garageRef.get();
      if (!garageSnap.exists) {
        return res.status(404).json({ success: false, error: 'GARAGE_NOT_FOUND' });
      }

      const garageData = garageSnap.data() || {};

      // Delete subcollections in batches
      const subcollections = ['vehicles', 'subscribers', 'daily_counts', 'daily_stats'];
      for (const sub of subcollections) {
        const subCollRef = adminDb.collection(`garages/${garageId}/${sub}`);
        const subSnap = await subCollRef.get();
        if (!subSnap.empty) {
          const batch = adminDb.batch();
          subSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }

      // Delete the garage doc
      await garageRef.delete();

      // Log garage deletion
      const logRef = adminDb.collection('activity_logs').doc();
      await logRef.set({
        garageId,
        garageName: garageData.name || '',
        staffId: req.user?.uid || null,
        staffName: req.user?.displayName || 'الإدارة',
        actionType: 'garage_delete',
        plateNumber: `حذف جراج: ${garageData.name || garageId}`,
        timestamp: new Date(),
        amount: 0,
        details: {
          deletedByRole: callerRole,
          deletedByUid: req.user?.uid || null
        }
      });

      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Garage] Error in delete garage:', e);
      const { statusCode, message } = mapDomainErrorToStatus(e);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Supervisor Operations (Update / Delete)
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
  app.post('/api/delegates/update', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (!['admin', 'supervisor'].includes(req.user?.role || '')) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin or Supervisor role required' });
      }
      const { id, name, phone, commissionRate, commissions, defaultTrialDays } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (name) updates.name = String(name).trim();
      if (phone !== undefined) updates.phone = String(phone).trim();
      if (commissionRate !== undefined) updates.commissionRate = Number(commissionRate);
      if (commissions) updates.commissions = commissions;
      if (defaultTrialDays !== undefined) updates.defaultTrialDays = Number(defaultTrialDays);

      await adminDb.collection('delegates').doc(id).update(updates);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Delegate] Error in update:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/delegates/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (!['admin', 'supervisor'].includes(req.user?.role || '')) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin or Supervisor role required' });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection('delegates').doc(id).delete();
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Delegate] Error in delete:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Staff Operations (Update / Delete)
  app.post('/api/staff/update', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { id, name, phone, role, permissions } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      if (callerRole !== 'admin' && callerRole !== 'supervisor') {
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

      if (callerRole !== 'admin' && callerRole !== 'supervisor') {
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
  app.post('/api/garages/update', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { id, ...data } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

      if (callerRole !== 'admin' && callerRole !== 'supervisor' && callerGarageId !== id) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot update another garage' });
      }

      // Filter out invalid/undefined fields
      const updates: Record<string, any> = { updatedAt: new Date() };
      const allowedKeys = [
        'name', 'phone', 'hourlyRate', 'overnightRate', 'monthlySubscriptionFee', 
        'billingModel', 'commissionPerVehicle', 'status', 'isLocked', 'isMaintenanceMode', 
        'maintenanceMessage', 'warningDaysThreshold', 'assignedDelegateId', 'currentSessionId'
      ];
      for (const key of allowedKeys) {
        if (key in data && data[key] !== undefined) {
          updates[key] = data[key];
        }
      }

      await adminDb.collection('garages').doc(id).update(updates);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Garage] Error in update:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/garages/recalculate-cars-inside', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId } = req.body || {};
      if (!garageId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const vehSnap = await adminDb.collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get();
      const actualCount = vehSnap.size;

      await adminDb.collection('garages').doc(garageId).update({ carsInside: actualCount });
      return res.json({ success: true, count: actualCount });
    } catch (e: any) {
      console.error('[Server Garage] Error in recalculate-cars-inside:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Packages (Create / Delete)
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
  app.post('/api/subscribers/add', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId, subscriberData } = req.body || {};
      if (!garageId || !subscriberData || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      const docRef = adminDb.collection(`garages/${garageId}/subscribers`).doc();
      await docRef.set({
        ...subscriberData,
        id: docRef.id,
        createdAt: new Date()
      });

      return res.json({ success: true, id: docRef.id });
    } catch (e: any) {
      console.error('[Server Subscribers] Error in add:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/subscribers/renew', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId, subscriberId, newDates } = req.body || {};
      if (!garageId || !subscriberId || !newDates || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection(`garages/${garageId}/subscribers`).doc(subscriberId).update({
        startDate: newDates.startDate,
        endDate: newDates.endDate
      });

      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Subscribers] Error in renew:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/subscribers/update', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId, subscriberId, subscriberData } = req.body || {};
      if (!garageId || !subscriberId || !subscriberData || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection(`garages/${garageId}/subscribers`).doc(subscriberId).update(subscriberData);
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Subscribers] Error in update:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  app.post('/api/subscribers/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId, subscriberId } = req.body || {};
      if (!garageId || !subscriberId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });

      await adminDb.collection(`garages/${garageId}/subscribers`).doc(subscriberId).delete();
      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Subscribers] Error in delete:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Recharge Requests (Create)
  app.post('/api/recharge-requests/create', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const cleanData = Object.fromEntries(
        Object.entries(req.body || {}).filter(([_, v]) => v !== undefined)
      );

      const docRef = await adminDb.collection('recharge_requests').add({
        ...cleanData,
        status: 'pending',
        createdAt: new Date()
      });

      return res.json({ success: true, id: docRef.id });
    } catch (e: any) {
      console.error('[Server RechargeRequests] Error in create:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Activity Logs (Add)
  app.post('/api/activity-logs/add', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      if (!adminDb) return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });

      const { id, timestamp, ...rest } = req.body || {};
      const docRef = await adminDb.collection('activity_logs').add({
        ...rest,
        timestamp: new Date()
      });

      return res.json({ success: true, id: docRef.id });
    } catch (e: any) {
      console.error('[Server ActivityLogs] Error in add:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
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
