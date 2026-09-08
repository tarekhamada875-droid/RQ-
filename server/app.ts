import express from 'express';
import {
  adminDb,
  adminAuth
} from './firebaseAdmin';
import {
  normalizeDigits,
  cleanPin,
  hashPinWithUniqueSalt,
  computeLookupHash,
  legacyHashPin,
  hashPin,
  isHashedPin,
  verifyScryptHash,
  verifySingleFieldValue,
  verifyPinMatch,
  verifyDocMatch,
  migratePinToHash,
  checkRateLimit,
  resetRateLimit,
  getAdminPin,
  queryAccountWherePin,
  queryDelegatesWherePhone
} from './utils';
import {
  requireAuth,
  AuthRequest,
  correlationMiddleware,
  requestTimeoutMiddleware,
  financialRateLimiter
} from './middleware';
import {
  validateId,
  validateNumber,
  validateString,
  validatePlate,
  validateEnum,
  sanitizePayload,
  validateIdempotencyKey,
  ValidationError
} from './validation';
import {
  checkIdempotencyInTransaction,
  storeIdempotencyInTransaction
} from './idempotency';

/**
 * Domain Error Status Code Resolver
 */
function mapDomainErrorToStatus(err: any): { statusCode: number; code: string; message: string } {
  if (err instanceof ValidationError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message };
  }

  const errMsg = String(err?.message || err || '');

  if (errMsg.includes('GARAGE_NOT_FOUND') || errMsg.includes('VEHICLE_NOT_FOUND') || errMsg.includes('REQUEST_NOT_FOUND') || errMsg.includes('PACKAGE_NOT_FOUND')) {
    return { statusCode: 404, code: 'NOT_FOUND', message: errMsg };
  }

  if (
    errMsg.includes('REQUEST_ALREADY_PROCESSED') ||
    errMsg.includes('VEHICLE_ALREADY_INSIDE') ||
    errMsg.includes('VEHICLE_ALREADY_OUTSIDE') ||
    errMsg.includes('INSUFFICIENT_BALANCE') ||
    errMsg.includes('CAPACITY_LIMIT_REACHED') ||
    errMsg.includes('DAILY_DELETION_LIMIT_REACHED') ||
    errMsg.includes('reached_daily_deletion_limit') ||
    errMsg.includes('PIN_ALREADY_TAKEN') ||
    errMsg.includes('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION') ||
    errMsg.includes('NO_REFERRAL_REWARDS_AVAILABLE')
  ) {
    return { statusCode: 409, code: 'CONFLICT', message: errMsg };
  }

  if (
    errMsg.includes('FORBIDDEN') ||
    errMsg.includes('UNAUTHORIZED_GARAGE_ACCESS') ||
    errMsg.includes('GARAGE_SCOPE_MISMATCH') ||
    errMsg.includes('ADMIN_ONLY') ||
    errMsg.includes('GARAGE_CANNOT_RECHARGE_OTHERS') ||
    errMsg.includes('ADMIN_OR_SUPERVISOR_ONLY')
  ) {
    return { statusCode: 403, code: 'FORBIDDEN', message: errMsg };
  }

  if (errMsg.includes('UNAUTHORIZED') || errMsg.includes('INVALID_ID_TOKEN') || errMsg.includes('SESSION_INACTIVE')) {
    return { statusCode: 401, code: 'UNAUTHORIZED', message: errMsg };
  }

  return { statusCode: 500, code: 'INTERNAL_ERROR', message: errMsg || 'TRANSACTION_FAILED' };
}

export function createApp() {
  const app = express();
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

  app.post('/api/auth/verify-pin', async (req, res) => {
    try {
      const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
          success: false,
          error: 'تم تجاوز عدد المحاولات المسموح بها، يرجى الانتظار لمدة دقيقة والمحاولة مجدداً'
        });
      }

      const credentials = req.body || {};
      const rawInput = credentials.pin || credentials.input;

      // Token verification trust boundary
      let verifiedUid = '';
      if (credentials.firebaseIdToken) {
        if (adminAuth) {
          try {
            const decoded = await adminAuth.verifyIdToken(credentials.firebaseIdToken);
            verifiedUid = decoded.uid;
          } catch (tokenErr) {
            console.warn('[Server Auth] Invalid Firebase ID token:', tokenErr);
            return res.status(401).json({ success: false, error: 'INVALID_ID_TOKEN' });
          }
        }
      }

      // Check for UID mismatch if body.uid is supplied alongside verified token
      if (verifiedUid && credentials.uid && credentials.uid.trim() !== verifiedUid) {
        return res.status(401).json({ success: false, error: 'UID_MISMATCH' });
      }

      const effectiveUid = verifiedUid || (typeof credentials.uid === 'string' ? credentials.uid.trim() : '');
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
          resetRateLimit(clientIp);

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
            resetRateLimit(clientIp);

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
  app.post('/api/auth/check-pin-availability', async (req, res) => {
    try {
      const { pin, excludeId } = req.body || {};
      const normPin = cleanPin(pin);
      if (!normPin) {
        return res.json({ taken: false });
      }

      // Check Admin PIN
      let adminPinStored = await getAdminPin();
      if (adminPinStored && verifyPinMatch(normPin, adminPinStored).matches) {
        return res.json({ taken: true, role: 'مسؤول النظام (الآدمن الرئيسي)', name: 'الآدمن' });
      }

      const collectionsToCheck = [
        { name: 'supervisors', label: 'مشرف نظام' },
        { name: 'delegates', label: 'مندوب شحن' },
        { name: 'staff', label: 'موظف جراج' },
        { name: 'garages', label: 'صاحب جراج' }
      ];

      for (const coll of collectionsToCheck) {
        try {
          const docs = await queryAccountWherePin(coll.name, normPin);
          for (const dDoc of docs) {
            if (excludeId && dDoc.id === excludeId) continue;
            const docData = dDoc.data;
            return res.json({
              taken: true,
              role: coll.label,
              name: docData.name || docData.ownerName || docData.garageName || 'مستخدم آخر'
            });
          }
        } catch (e) {}
      }

      return res.json({ taken: false });
    } catch (error) {
      console.error('[Server Auth] Error in check-pin-availability:', error);
      return res.status(500).json({ taken: false });
    }
  });

  // Secure Server API: Verify Admin PIN for Admin Logout
  app.post('/api/auth/verify-admin-pin', async (req, res) => {
    try {
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
      return res.json({ valid: matches });
    } catch (error) {
      return res.status(500).json({ valid: false });
    }
  });

  // Secure Server API: Claim / Re-claim Admin Session (Protected against unauthenticated escalation)
  app.post('/api/auth/claim-admin-session', async (req, res) => {
    try {
      const { uid, sessionId, pin, firebaseIdToken } = req.body || {};
      if (!uid || !sessionId || typeof uid !== 'string' || typeof sessionId !== 'string') {
        return res.status(400).json({ success: false, error: 'بيانات غير صالحة' });
      }

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'Admin DB غير مهيأ' });
      }

      let verifiedUid = '';
      if (firebaseIdToken && adminAuth) {
        try {
          const decoded = await adminAuth.verifyIdToken(firebaseIdToken);
          verifiedUid = decoded.uid;
        } catch (tokenErr) {
          console.warn('[Server Auth] Invalid Firebase ID token during claim-admin-session:', tokenErr);
          return res.status(401).json({ success: false, error: 'INVALID_ID_TOKEN' });
        }
      }

      if (verifiedUid && uid.trim() !== verifiedUid) {
        return res.status(401).json({ success: false, error: 'UID_MISMATCH' });
      }

      const effectiveUid = verifiedUid || uid.trim();

      // Check authorization: Must either have valid admin PIN OR already have an active matching session
      let isAuthorized = false;
      const cleanInputPin = pin ? cleanPin(pin) : '';
      if (cleanInputPin) {
        const adminPinStored = await getAdminPin();
        if (verifyPinMatch(cleanInputPin, adminPinStored).matches) {
          isAuthorized = true;
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
        return res.status(403).json({ success: false, error: 'غير مصرح: يتطلب إدخال الرقم السري' });
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
        return res.json({ success: false, error: 'SESSION_OCCUPIED' });
      }
      console.error('[Server Auth] Error in claim-admin-session:', e);
      return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
    }
  });

  // Secure Server API: Validate or Refresh an active session across all roles
  app.post('/api/auth/validate-or-refresh-session', async (req, res) => {
    try {
      const { uid, sessionId, role, entityId, firebaseIdToken } = req.body || {};
      if (!uid || !sessionId || !role) {
        return res.status(400).json({ valid: false, error: 'INVALID_PARAMS' });
      }

      if (!adminDb) {
        return res.status(503).json({ valid: false, error: 'DATABASE_UNAVAILABLE' });
      }

      let verifiedUid = '';
      if (firebaseIdToken && adminAuth) {
        try {
          const decoded = await adminAuth.verifyIdToken(firebaseIdToken);
          verifiedUid = decoded.uid;
        } catch (tokenErr) {
          return res.status(401).json({ valid: false, error: 'INVALID_ID_TOKEN' });
        }
      }

      if (verifiedUid && typeof uid === 'string' && uid.trim() !== verifiedUid) {
        return res.status(401).json({ valid: false, error: 'UID_MISMATCH' });
      }

      const effectiveUid = verifiedUid || (typeof uid === 'string' ? uid.trim() : '');

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
        return res.json({ valid: false, error: 'INVALID_ROLE' });
      }

      const secSnap = await adminDb.doc(`${secColl}/${effectiveUid}`).get();
      if (!secSnap.exists) {
        return res.json({ valid: false, error: 'SESSION_NOT_FOUND' });
      }

      const secData = secSnap.data() || {};
      if (!secData.isActive || secData.sessionId !== sessionId) {
        return res.json({ valid: false, error: 'SESSION_INVALID' });
      }

      // Check session expiration timeout (15 minutes of inactivity)
      const rawLastActive = secData.lastActive;
      const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
      const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
      if (lastActive > 0 && (Date.now() - lastActive > SESSION_TIMEOUT_MS)) {
        await adminDb.doc(`${secColl}/${effectiveUid}`).update({ isActive: false }).catch(() => {});
        return res.json({ valid: false, error: 'SESSION_EXPIRED' });
      }

      // Check entity level lock: If another session has claimed the entity, this session is revoked
      const targetEntityId = role === 'admin' ? 'auth_pin' : entityId;
      if (targetEntityId) {
        const entitySnap = await adminDb.doc(`${entityColl}/${targetEntityId}`).get();
        if (entitySnap.exists) {
          const entityData = entitySnap.data() || {};
          if (entityData.currentSessionId && entityData.currentSessionId !== sessionId) {
            await adminDb.doc(`${secColl}/${effectiveUid}`).update({ isActive: false }).catch(() => {});
            return res.json({ valid: false, error: 'SESSION_REVOKED' });
          }
        }
      }

      // Refresh timestamps
      const now = new Date();
      await adminDb.doc(`${secColl}/${effectiveUid}`).set({ lastActive: now }, { merge: true });
      if (targetEntityId) {
        await adminDb.doc(`${entityColl}/${targetEntityId}`).set({ lastActive: now }, { merge: true });
      }

      return res.json({ valid: true });
    } catch (error) {
      console.error('[Server Auth] Error validating session:', error);
      return res.status(500).json({ valid: false, error: 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Release Session (Universal across all roles)
  app.post('/api/auth/release-session', async (req, res) => {
    try {
      const { uid, sessionId, role, entityId, firebaseIdToken } = req.body || {};
      const authHeader = req.headers.authorization;
      let token = '';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split('Bearer ')[1]?.trim();
      } else if (firebaseIdToken) {
        token = String(firebaseIdToken).trim();
      }

      if (!uid || !sessionId || !role) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }

      if (!adminDb || !adminAuth) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      if (!token) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED: Missing token' });
      }

      let verifiedUid = '';
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        verifiedUid = decoded.uid;
      } catch (tokenErr) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED: Invalid token' });
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
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Unauthorized session release' });
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
  app.post('/api/auth/release-admin-session', async (req, res) => {
    try {
      const { uid, sessionId, firebaseIdToken } = req.body || {};
      const authHeader = req.headers.authorization;
      let token = '';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split('Bearer ')[1]?.trim();
      } else if (firebaseIdToken) {
        token = String(firebaseIdToken).trim();
      }

      if (!uid || !sessionId) {
        return res.status(400).json({ success: false, error: 'MISSING_PARAMETERS' });
      }

      if (!adminDb || !adminAuth) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      if (!token) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED: Missing token' });
      }

      let verifiedUid = '';
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        verifiedUid = decoded.uid;
      } catch (tokenErr) {
        return res.status(401).json({ success: false, error: 'UNAUTHORIZED: Invalid token' });
      }

      if (verifiedUid !== uid) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Caller UID mismatch' });
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
    if (req.user?.role === 'garage') return res.status(403).json({ success: false, error: 'GARAGE_CANNOT_RECHARGE_OTHERS' });
    try {
      const sanitized = sanitizePayload(req.body, ['garageId', 'packageId', 'adminDetails', 'idempotencyKey'], false);
      const garageId = validateId(sanitized.garageId, 'garageId', true);
      const packageId = validateId(sanitized.packageId, 'packageId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);
      const callerUid = req.user?.uid;
      const callerRole = req.user?.role || '';
      const adminDetails = sanitized.adminDetails || {};

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      // Package Data Parsing & Sanitization (Server Authoritative)
      const pkgSnap = await adminDb.doc(`packages/${packageId}`).get();
      if (!pkgSnap.exists) {
        return res.status(404).json({ success: false, error: 'PACKAGE_NOT_FOUND' });
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
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey);
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
          billingModel: 'subscription'
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
      const { statusCode, message } = mapDomainErrorToStatus(error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Approve Recharge Request
  app.post('/api/transactions/approve-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
      return res.status(403).json({ success: false, error: 'ADMIN_OR_SUPERVISOR_ONLY' });
    }
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['requestId', 'request', 'idempotencyKey'], false);
      const reqId = validateId(sanitized.requestId || sanitized.request?.id, 'requestId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      let resultData: any = null;

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey);
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
        const settingsSnap = await t.get(adminDb.doc('admin_settings/general'));
        const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};

        const delegateCommissions = systemConfig?.delegatePackageCommissions || {
          daily: 5,
          weekly: 15,
          biweekly: 25,
          monthly: systemConfig?.referralFeePerRenewal !== undefined ? Number(systemConfig.referralFeePerRenewal) : 50
        };

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
          // Package Price Calculation from Package Doc or Server Defaults
          const rawPackageData = requestData.packageData || {};
          let basePrice = Number(rawPackageData.price || rawPackageData.priceAmount || requestData.amount || 0);

          if (requestData.packageId) {
            const pkgRef = adminDb.doc(`packages/${requestData.packageId}`);
            const pkgSnap = await t.get(pkgRef);
            if (pkgSnap.exists) {
              basePrice = Number(pkgSnap.data()?.price || basePrice);
            }
          }

          const durationDays = Number(requestData.durationDays || requestData.carsCount || 30);

          let commission = 0;
          if (referredByDelegate) {
            if (durationDays >= 30) commission = Number(delegateCommissions.monthly || 50);
            else if (durationDays >= 14) commission = Number(delegateCommissions.biweekly || 25);
            else if (durationDays >= 7) commission = Number(delegateCommissions.weekly || 15);
            else commission = Number(delegateCommissions.daily || 5);
          }

          const effectiveOriginalRevenue = basePrice;
          const discountAmount = Number(requestData.discountAmount || 0);
          let effectiveRevenue = Math.max(0, basePrice - discountAmount);
          if (garageData.hasMonthlySubscribers === true) {
            effectiveRevenue += subscriberFlatFee;
          }

          // Delegate Doc Check
          const targetDelegateId = delegateReferrerId || requestData.delegateId || null;
          let delegateRef: any = null;
          let delegateSnap: any = null;
          if (targetDelegateId) {
            delegateRef = adminDb.doc(`delegates/${targetDelegateId}`);
            delegateSnap = await t.get(delegateRef);
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

          // Unlimited capacity check
          const pkgName = String(requestData.packageName || '');
          const isUnlimitedPkg =
            pkgName.includes('مفتوح') ||
            pkgName.includes('غير محدود') ||
            pkgName.includes('غير محدودة') ||
            pkgName.includes('بدون حدود') ||
            pkgName.includes('سعة مفتوحة');

          const effCapacity = isUnlimitedPkg ? 0 : Math.max(1, Number(requestData.dailyCapacity || 40));

          // Update Garage
          t.set(garageRef, {
            balanceExpiry: baseDate,
            dailyCapacity: effCapacity,
            activePackageName: requestData.packageName || 'الباقة',
            packageName: requestData.packageName || 'الباقة',
            billingModel: 'subscription',
            isLocked: false,
            isTrial: false,
            totalAdminRevenue: (garageData.totalAdminRevenue || 0) + effectiveRevenue,
            lastRechargeDate: new Date(),
            lastRechargeAmount: effectiveRevenue,
            lastRechargePackageName: requestData.packageName || null
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
      const { statusCode, message } = mapDomainErrorToStatus(error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Reject Recharge Request
  app.post('/api/transactions/reject-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') return res.status(403).json({ success: false, error: 'ADMIN_OR_SUPERVISOR_ONLY' });
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['requestId', 'idempotencyKey'], false);
      const requestId = validateId(sanitized.requestId, 'requestId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate } = await checkIdempotencyInTransaction(t, idempotencyKey);
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
      const { statusCode, message } = mapDomainErrorToStatus(error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Admin Direct Balance Top-Up
  app.post('/api/transactions/admin-topup-balance', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'ADMIN_ONLY' });
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['garageId', 'amount', 'idempotencyKey'], false);
      const garageId = validateId(sanitized.garageId, 'garageId', true);
      const numAmount = validateNumber(sanitized.amount, 'amount', { min: 1, max: 1000000, integer: true });
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      let resultData: any = null;

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey);
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
      const { statusCode, message } = mapDomainErrorToStatus(error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  // Secure Server API: Garage Self-Service Subscription Using Balance
  app.post('/api/transactions/garage-self-subscribe', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    const userRole = req.user?.role;
    const userGarageId = req.user?.garageId;
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ['garageId', 'packageId', 'idempotencyKey'], false);
      const bodyGarageId = validateId(sanitized.garageId, 'garageId', false);
      const packageId = validateId(sanitized.packageId, 'packageId', true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      const garageId = userRole === 'garage' ? userGarageId : (bodyGarageId || userGarageId);
      if (userRole === 'garage' && userGarageId !== bodyGarageId && bodyGarageId) {
        return res.status(403).json({ success: false, error: 'UNAUTHORIZED_GARAGE_ACCESS' });
      }
      if (!garageId) {
        return res.status(400).json({ success: false, error: 'GARAGE_ID_REQUIRED' });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      let resultData: any = null;

      await adminDb.runTransaction(async (t: any) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey);
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

        // Resolve package info entirely from server
        let pkg = null;
        if (packageId) {
          const pkgRef = adminDb.doc(`packages/${packageId}`);
          const pkgSnap = await t.get(pkgRef);
          if (pkgSnap.exists) {
            pkg = { id: pkgSnap.id, ...pkgSnap.data() };
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
          lastRechargePackageName: pkgName
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
      const { statusCode, message } = mapDomainErrorToStatus(error);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });

  
  // Secure Server API: Vehicle Check-In
  app.post('/api/vehicles/check-in', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId: bodyGarageId, plateNumber, plateRaw, type, isSubscriber, staffName } = req.body || {};
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

      await adminDb.runTransaction(async (t: any) => {
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${plateRaw}`);
        const today = getCairoDateKey();
        const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);

        const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);

        if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
        const garageData = garageSnap.data() || {};
        
        // Subscription check
        const expDateRaw = garageData.balanceExpiry;
        if (!expDateRaw) throw new Error('SUBSCRIPTION_EXPIRED');
        const expDate = expDateRaw.toDate ? expDateRaw.toDate() : new Date(expDateRaw);
        if (isNaN(expDate.getTime()) || expDate.getTime() < Date.now()) {
           throw new Error('SUBSCRIPTION_EXPIRED');
        }

        // Capacity check
        const capacity = Number(garageData.dailyCapacity || 0);
        const used = Number(garageData.todayCount || 0);
        const isUnlimited = capacity === 0 || String(garageData.activePackageName || '').includes('مفتوح');
        if (!isUnlimited && used >= capacity) {
          throw new Error('CAPACITY_LIMIT_REACHED');
        }

        if (vehicleSnap.exists && vehicleSnap.data()?.status === 'inside') {
          throw new Error('VEHICLE_ALREADY_INSIDE');
        }

        const isNewDay = garageData.lastTransactionDate !== today;
        
        t.set(vehicleRef, {
          id: plateRaw,
          plate: plateNumber,
          plateNumber,
          plateNumberRaw: plateRaw,
          type: type || 'hourly',
          isSubscriber: !!isSubscriber,
          entryTime: new Date(),
          status: 'inside',
          staffId: staffId || null,
          staffName: staffName || 'مدير الجراج'
        }, { merge: true });

        t.set(garageRef, {
          carsInside: (garageData.carsInside || 0) + 1,
          todayCount: isNewDay ? 1 : used + 1,
          todayRevenue: isNewDay ? 0 : (garageData.todayRevenue || 0),
          lastTransactionDate: today
        }, { merge: true });

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
          staffName: staffName || 'مدير الجراج',
          actionType: 'check_in',
          plateNumber,
          timestamp: new Date(),
          amount: 0
        });
      });

      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Server] Check-in error:', err);
      return res.status(500).json({ success: false, error: err.message || 'CHECK_IN_FAILED' });
    }
  });

  // Secure Server API: Vehicle Check-Out
  app.post('/api/vehicles/check-out', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId: bodyGarageId, vehicleId, staffName } = req.body || {};
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

        if (vehicleData.status === 'outside') {
          throw new Error('VEHICLE_ALREADY_OUTSIDE');
        }

        // Server-authoritative cost calculation
        let cost = 0;
        if (!vehicleData.isSubscriber) {
          const entryTime = vehicleData.entryTime?.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
          if (entryTime && !isNaN(entryTime.getTime())) {
            const diffMs = Date.now() - entryTime.getTime();
            let hours = Math.ceil(diffMs / (1000 * 60 * 60));
            if (hours < 1) hours = 1;
            const rate = Number(garageData.hourlyRate || 0);
            cost = hours * rate;
          }
        }
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
          staffName: staffName || 'مدير الجراج',
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
      return res.status(500).json({ success: false, error: err.message || 'CHECK_OUT_FAILED' });
    }
  });

  // Secure Server API: Vehicle Delete
  app.post('/api/vehicles/delete', requireAuth, async (req: AuthRequest, res: any) => {
    try {
      const { garageId: bodyGarageId, vehicleId, refundAmount, staffName } = req.body || {};
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

        if (!garageDoc.exists || !vehicleDoc.exists) throw new Error('NOT_FOUND');
        
        const garageData = garageDoc.data() || {};
        const vehicleData = vehicleDoc.data() || {};
        
        // Deletion limit logic
        const todayDeletions = garageData.lastDeletionDate === todayYMD ? (garageData.dailyDeletionCount || 0) : 0;
        if (todayDeletions >= 3) {
          throw new Error('reached_daily_deletion_limit');
        }

        const isSameRefundDay = garageData.lastRefundDate === todayYMD;
        // Strict refund validation: refund amount cannot exceed actual fee recorded for this vehicle,
        // and cannot be refunded if the vehicle was only inside (unpaid entry).
        const requestedRefund = Math.max(0, Number(refundAmount || 0));
        const maxEligibleRefund = (vehicleData.status === 'exited' && typeof vehicleData.cost === 'number')
          ? Math.max(0, vehicleData.cost)
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
          staffName: staffName || vehicleData.staffName || 'مدير الجراج',
          actionType: 'delete_refund',
          plateNumber: `مسح لوحة: ${vehicleData.plateNumber || vehicleId}`,
          timestamp: new Date(),
          amount: refundAmt
        });
      });
      return res.json({ success: true });
    } catch (err: any) {
      console.error('[Server] Delete error:', err);
      if (err?.message === 'reached_daily_deletion_limit') {
        return res.status(403).json({ success: false, error: 'reached_daily_deletion_limit' });
      }
      if (err?.message === 'NOT_FOUND') {
        return res.status(404).json({ success: false, error: 'VEHICLE_NOT_FOUND' });
      }
      return res.status(500).json({ success: false, error: err?.message || 'DELETE_FAILED' });
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

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      // Check uniqueness of new PIN
      const existingAccount = await queryAccountWherePin(normNewPin);
      if (existingAccount && !(existingAccount.role === 'admin' && existingAccount.id === 'auth_pin')) {
        return res.status(400).json({
          success: false,
          error: 'PIN_ALREADY_TAKEN',
          takenBy: { name: existingAccount.account?.name || '', role: existingAccount.role }
        });
      }

      // If current PIN is supplied, verify it
      if (currentPin) {
        const normCurrent = cleanPin(currentPin);
        const adminDocSnap = await adminDb.doc('admin_settings/auth_pin').get();
        if (adminDocSnap.exists) {
          const storedPin = adminDocSnap.data()?.pin || '';
          const isMatch = verifyPinMatch(normCurrent, storedPin);
          if (!isMatch) {
            return res.status(400).json({ success: false, error: 'CURRENT_PIN_INCORRECT' });
          }
        }
      }

      const scryptHash = hashPinWithUniqueSalt(normNewPin);
      const lookupHash = computeLookupHash(normNewPin);

      await adminDb.doc('admin_settings/auth_pin').set({
        pin: scryptHash,
        pinLookupHash: lookupHash,
        updatedAt: new Date()
      }, { merge: true });

      return res.json({ success: true });
    } catch (e: any) {
      console.error('[Server Admin] Error in update-pin:', e);
      return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
    }
  });

  // Secure Server API: Authoritative Garage Creation
  app.post('/api/garages/create', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
    try {
      const callerRole = req.user?.role;
      const callerUid = req.user?.uid;
      const callerName = req.user?.name || '';

      if (!callerRole || !['admin', 'supervisor', 'delegate'].includes(callerRole)) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Creation not permitted for role' });
      }

      const sanitized = sanitizePayload(req.body, ['name', 'phone', 'hourlyRate', 'overnightRate', 'pin', 'billingModel', 'isTrial', 'trialDays', 'defaultTrialDays', 'dailyCapacity', 'initialPackageId', 'packages', 'createdByDelegateId', 'createdByDelegateName', 'referrerId', 'referrerName', 'referredByGarageId', 'referredByGarageName', 'idempotencyKey'], false);

      const name = validateString(sanitized.name, 'name', { min: 2, max: 100, required: true })!;
      const normPin = cleanPin(sanitized.pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: 'INVALID_PIN: PIN must be 4-10 digits' });
      }

      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      // Check PIN availability
      const existingMatch = await queryAccountWherePin(normPin);
      if (existingMatch) {
        return res.status(400).json({
          success: false,
          error: 'PIN_ALREADY_TAKEN',
          takenBy: { name: existingMatch.account?.name || '', role: existingMatch.role }
        });
      }

      const scryptHash = hashPinWithUniqueSalt(normPin);
      const lookupHash = computeLookupHash(normPin);

      const isTrial = sanitized.isTrial !== undefined ? Boolean(sanitized.isTrial) : true;
      const trialDays = validateNumber(sanitized.trialDays || sanitized.defaultTrialDays, 'trialDays', { min: 1, max: 365 }) || 15;
      const now = new Date();

      let balanceExpiry = new Date(now.getTime() + (trialDays > 0 ? trialDays : 15) * 24 * 60 * 60 * 1000);
      let dailyCapacity = validateNumber(sanitized.dailyCapacity, 'dailyCapacity', { min: 0, max: 10000 }) || 40;
      let activePackageName = `الباقة التجريبية (${trialDays} يوم)`;

      if (!isTrial && sanitized.initialPackageId && Array.isArray(sanitized.packages)) {
        const pkg = sanitized.packages.find((p: any) => p?.id === sanitized.initialPackageId);
        if (pkg) {
          const durationDays = Number(pkg.durationDays || 30);
          dailyCapacity = pkg.isUnlimited ? 0 : Number(pkg.dailyCapacity || 40);
          balanceExpiry = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
          activePackageName = String(pkg.name || 'باقة الاشتراك');
        }
      }

      const garageRef = adminDb.collection('garages').doc();
      const garageId = garageRef.id;

      const garageDoc: any = {
        name: name.trim(),
        phone: sanitized.phone ? String(sanitized.phone).trim() : '',
        hourlyRate: validateNumber(sanitized.hourlyRate, 'hourlyRate', { min: 0, max: 10000 }) || 0,
        overnightRate: validateNumber(sanitized.overnightRate, 'overnightRate', { min: 0, max: 10000 }) || 0,
        pin: scryptHash,
        pinLookupHash: lookupHash,
        billingModel: sanitized.billingModel || 'subscription',
        status: 'approved',
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

      if (callerRole === 'delegate' && callerUid) {
        garageDoc.createdByDelegateId = callerUid;
        garageDoc.createdByDelegateName = callerName || 'المندوب';
        garageDoc.referrerId = callerUid;
        garageDoc.referrerName = callerName || 'المندوب';
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
        staffName: callerName || (isTrial ? 'النظام (تفعيل تجريبي)' : 'الإدارة (تفعيل الاشتراك)'),
        actionType: 'recharge',
        plateNumber: isTrial
          ? `تفعيل الباقة التجريبية (${trialDays} يوم)`
          : `تفعيل اشتراك: ${activePackageName}`,
        timestamp: now,
        amount: 0,
        details: {
          packageName: isTrial ? `الباقة التجريبية (${trialDays} يوم)` : activePackageName,
          durationDays: isTrial ? trialDays : 30,
          carsCount: dailyCapacity,
          revenueAmount: 0
        }
      });

      return res.json({ success: true, id: garageId });
    } catch (e: any) {
      console.error('[Server Garage] Error in create garage:', e);
      const { statusCode, message } = mapDomainErrorToStatus(e);
      return res.status(statusCode).json({ success: false, error: message });
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

      // Only garage owner of this garage, admin, or supervisor can claim
      if (callerRole === 'garage' && callerUid !== garageId) {
        return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot claim reward for another garage' });
      }

      if (!adminDb) {
        return res.status(500).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
      }

      let claimedDays = 0;
      await adminDb.runTransaction(async (t) => {
        // Idempotency check
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey);
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
      const { statusCode, message } = mapDomainErrorToStatus(e);
      return res.status(statusCode).json({ success: false, error: message });
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
        staffName: req.user?.name || 'الإدارة',
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

  // Vite development middleware vs Static Production serving
  
  // API 404 handler

  // API 404 handler
  app.use('/api', (req: express.Request, res: express.Response) => {
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
