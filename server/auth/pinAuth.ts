import { Router } from 'express';
import { adminDb } from '../firebaseAdmin';
import {
  cleanPin,
  verifyPinMatch,
  verifyDocMatch,
  migratePinToHash,
  checkRateLimit,
  resetRateLimit,
  getAdminPin,
  queryAccountWherePin,
  queryDelegatesWherePhone,
  checkPinAvailabilityAcrossAll
} from '../utils';
import {
  requireFirebaseUser,
  AuthRequest,
  financialRateLimiter,
  sendApiError
} from '../middleware';
import { isNewPinFormat } from '../validation';
import { addActiveSession } from './sessionMarkers';

export const pinAuthRouter = Router();

pinAuthRouter.post('/api/auth/verify-pin', requireFirebaseUser, async (req: AuthRequest, res) => {
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

    const expectedRole = credentials.expectedRole;
    if (expectedRole !== undefined && expectedRole !== 'delegate') {
      return res.status(400).json({ success: false, error: 'INVALID_ROLE_SCOPE' });
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
        if (adminCheck.isLegacy && !expectedRole) {
          migratePinToHash('admin_settings', 'auth_pin', normInputPin);
        }
      }

      for (let index = 0; index < collectionsToCheck.length; index += 1) {
        const coll = collectionsToCheck[index];
        const docs = collectionResults[index] || [];
        for (const docSnap of docs) {
          const data = { ...docSnap.data };
          if (docSnap.isLegacyMatch && !expectedRole && coll.role !== 'supervisor') {
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
        // Legacy Supervisor records remain stored and their PINs remain reserved,
        // but retirement forbids issuing any new Supervisor session.
        if (match.role === 'supervisor') {
          return res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
        }
        if (expectedRole && match.role !== expectedRole) {
          return res.json({ success: false, error: 'بيانات الدخول غير صحيحة' });
        }
        if (expectedRole === 'delegate' && match.isLegacyMatch) {
          migratePinToHash('delegates', match.id, normInputPin);
        }

        if (effectiveUid && sessionId && adminDb) {
          try {
            const entityCollMap: Record<string, string> = {
              admin: 'admin_settings',
              delegate: 'delegates',
              garage: 'garages',
              staff: 'staff'
            };
            const secCollMap: Record<string, string> = {
              admin: 'admin_sessions',
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
              const deviceSecDocRef = adminDb.doc(`${secColl}/${effectiveUid}/sessions/${sessionId}`);

              await adminDb.runTransaction(async (transaction) => {
                const snap = await transaction.get(entityDocRef);
                if (snap.exists) {
                  const data = snap.data() || {};
                  const activeIds = addActiveSession(data, sessionId);
                  const now = new Date();
                  transaction.set(entityDocRef, { currentSessionId: sessionId, activeSessionIds: activeIds, lastActive: now }, { merge: true });
                } else {
                  transaction.set(entityDocRef, { currentSessionId: sessionId, activeSessionIds: [sessionId], lastActive: new Date() }, { merge: true });
                }

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
                transaction.set(deviceSecDocRef, {
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
              const deviceSecurityDocRef = adminDb.doc(`delegate_sessions/${effectiveUid}/sessions/${sessionId}`);
              await adminDb.runTransaction(async (transaction) => {
                const snap = await transaction.get(entityDocRef);
                if (snap.exists) {
                  const data = snap.data() || {};
                  transaction.set(entityDocRef, {
                    currentSessionId: sessionId,
                    activeSessionIds: addActiveSession(data, sessionId),
                    lastActive: new Date()
                  }, { merge: true });
                } else {
                  transaction.set(entityDocRef, { currentSessionId: sessionId, activeSessionIds: [sessionId], lastActive: new Date() }, { merge: true });
                }
                const now = new Date();
                const securityData = {
                  uid: effectiveUid,
                  role: 'delegate',
                  entityId: dDoc.id,
                  sessionId,
                  isActive: true,
                  lastActive: now,
                  createdAt: now
                };
                transaction.set(securityDocRef, securityData, { merge: true });
                transaction.set(deviceSecurityDocRef, securityData, { merge: true });
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
pinAuthRouter.post('/api/auth/check-pin-availability', requireFirebaseUser, financialRateLimiter(10, 60000), async (req: AuthRequest, res) => {
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
