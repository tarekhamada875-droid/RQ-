import type { Router } from 'express';
import { adminDb } from '../firebaseAdmin';
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
} from '../utils';
import {
  requireAuth,
  requireFirebaseUser,
  AuthRequest,
  financialRateLimiter,
  sendApiError
} from '../middleware';
import {
  validateNewPin,
  isNewPinFormat,
  ValidationError
} from '../validation';

export function registerAuthRoutes(router: Router) {
  router.post('/api/auth/verify-pin', requireFirebaseUser, async (req: AuthRequest, res) => {
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
      if (!sessionId) {
        return sendApiError(res, 400, 'SESSION_ID_REQUIRED', 'SESSION_ID_REQUIRED', req.correlationId);
      }

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
  router.post('/api/auth/check-pin-availability', requireFirebaseUser, financialRateLimiter(10, 60000), async (req: AuthRequest, res) => {
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
  router.post('/api/auth/verify-admin-pin', requireFirebaseUser, async (req: AuthRequest, res) => {
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
  router.post('/api/auth/claim-admin-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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
  router.post('/api/auth/validate-or-refresh-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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
      if (!lastActive || Date.now() - lastActive > SESSION_TIMEOUT_MS) {
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
  router.post('/api/auth/release-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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
  router.post('/api/auth/invalidate-all-sessions', requireAuth, async (req: AuthRequest, res: any) => {
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
  router.post('/api/auth/release-admin-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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
  router.post('/api/admin/update-pin', requireAuth, async (req: AuthRequest, res: any) => {
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

}
