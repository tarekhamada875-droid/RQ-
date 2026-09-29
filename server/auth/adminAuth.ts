import { Router } from 'express';
import { adminDb } from '../firebaseAdmin';
import {
  cleanPin,
  verifyPinMatch,
  saveEntityPin,
  checkRateLimit,
  resetRateLimit,
  getAdminPin,
  checkPinAvailabilityAcrossAll
} from '../utils';
import {
  requireAuth,
  requireFirebaseUser,
  AuthRequest,
  sendApiError
} from '../middleware';
import {
  validateNewPin,
  ValidationError
} from '../validation';
import { addActiveSession } from './sessionMarkers';
import {
  canClaimAdminSession,
  canUpdateAdminPin
} from '../domain/authorization';

export const adminAuthRouter = Router();

// Secure Server API: Verify Admin PIN for Admin Logout
adminAuthRouter.post('/api/auth/verify-admin-pin', requireFirebaseUser, async (req: AuthRequest, res) => {
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

    const activeAdminPin = await getAdminPin();
    const { matches, isLegacy } = verifyPinMatch(normInput, activeAdminPin);
    if (matches && isLegacy) {
      // Migrate legacy pin asynchronously
      adminDb?.doc('admin_settings/auth_pin').set({ pin: null, pinLookupHash: null, updatedAt: new Date() }, { merge: true }).catch(() => {});
    }
    if (matches) {
      await resetRateLimit(clientIp);
    }
    return res.json({ valid: matches });
  } catch {
    return res.status(500).json({ valid: false });
  }
});

// Secure Server API: Claim / Re-claim Admin Session (Protected against unauthenticated escalation)
adminAuthRouter.post('/api/auth/claim-admin-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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
    const cleanInputPin = pin ? cleanPin(pin) : '';
    let hasValidAdminPin = false;
    if (cleanInputPin) {
      const adminPinStored = await getAdminPin();
      if (verifyPinMatch(cleanInputPin, adminPinStored).matches) {
        hasValidAdminPin = true;
        await resetRateLimit(clientIp);
      }
    }

    const activeSessionSnap = hasValidAdminPin
      ? null
      : await adminDb.doc(`admin_sessions/${effectiveUid}`).get();
    const activeSession = activeSessionSnap?.exists ? activeSessionSnap.data() || {} : null;
    if (!canClaimAdminSession({ hasValidAdminPin, activeSession, requestedSessionId: sessionId })) {
      return sendApiError(res, 403, 'FORBIDDEN', 'غير مصرح: يتطلب إدخال الرقم السري', req.correlationId);
    }

    await adminDb.runTransaction(async (transaction) => {
      const entityDocRef = adminDb.doc('admin_settings/auth_pin');
      const secDocRef = adminDb.doc(`admin_sessions/${effectiveUid}`);
      const deviceSecDocRef = adminDb.doc(`admin_sessions/${effectiveUid}/sessions/${sessionId}`);

      const snap = await transaction.get(entityDocRef);
      if (snap.exists) {
        const data = snap.data() || {};
        transaction.set(entityDocRef, { currentSessionId: sessionId, activeSessionIds: addActiveSession(data, sessionId), lastActive: new Date() }, { merge: true });
      } else {
        transaction.set(entityDocRef, { currentSessionId: sessionId, activeSessionIds: [sessionId], lastActive: new Date() }, { merge: true });
      }
      const securityData = {
        uid: effectiveUid,
        role: 'admin',
        entityId: 'auth_pin',
        sessionId,
        isActive: true,
        lastActive: new Date(),
        createdAt: new Date()
      };
      transaction.set(secDocRef, securityData, { merge: true });
      transaction.set(deviceSecDocRef, securityData, { merge: true });
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

// Secure Server API: Release Admin Session (Backward compatibility)
adminAuthRouter.post('/api/auth/release-admin-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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

// Secure Server API: Admin PIN Update & Rotation
adminAuthRouter.post('/api/admin/update-pin', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (!canUpdateAdminPin(req.user)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }

    const { currentPin, newPin } = req.body || {};
    const normNewPin = validateNewPin(newPin, 'newPin');

    // Current PIN is mandatory — verifying it is the entire point of this
    // endpoint being separate from an admin-initiated reset.
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
