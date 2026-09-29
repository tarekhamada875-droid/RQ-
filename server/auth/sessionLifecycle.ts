import { Router } from 'express';
import { adminDb } from '../firebaseAdmin';
import { requireFirebaseUser, AuthRequest, sendApiError } from '../middleware';
import { removeActiveSession, hasActiveSession } from './sessionMarkers';
import { canReleaseSession } from '../domain/authorization';

export const sessionLifecycleRouter = Router();

// Secure Server API: Validate or Refresh an active session across all roles
sessionLifecycleRouter.post('/api/auth/validate-or-refresh-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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

    const legacySecSnap = await adminDb.doc(`${secColl}/${effectiveUid}`).get();
    const deviceSecSnap = await adminDb.doc(`${secColl}/${effectiveUid}/sessions/${sessionId}`).get();
    const secSnap = deviceSecSnap.exists ? deviceSecSnap : legacySecSnap;
    if (!secSnap.exists) {
      return res.json({ success: false, valid: false, code: 'NOT_FOUND', error: 'SESSION_NOT_FOUND' });
    }

    const secData = secSnap.data() || {};
    if (!secData.isActive || secData.sessionId !== sessionId) {
      return res.json({ success: false, valid: false, code: 'SESSION_INVALID', error: 'SESSION_INVALID' });
    }

    // Check session expiration timeout (24 hours of inactivity for persistent shift session)
    const rawLastActive = secData.lastActive;
    const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
    const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
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
        if (!hasActiveSession(entityData, sessionId)) {
          await adminDb.doc(`${secColl}/${effectiveUid}/sessions/${sessionId}`).update({ isActive: false }).catch(() => {});
          const rootSecSnap = await adminDb.doc(`${secColl}/${effectiveUid}`).get().catch(() => null);
          if (rootSecSnap && rootSecSnap.exists) {
            const rootData = rootSecSnap.data() || {};
            const remaining = removeActiveSession(rootData, sessionId);
            if (rootData.sessionId === sessionId) {
              await adminDb.doc(`${secColl}/${effectiveUid}`).update({
                activeSessionIds: remaining,
                sessionId: remaining.at(-1) ?? null,
                isActive: remaining.length > 0
              }).catch(() => {});
            }
          }
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
sessionLifecycleRouter.post('/api/auth/release-session', requireFirebaseUser, async (req: AuthRequest, res) => {
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
    let isActiveAdmin = false;
    let isActiveSupervisor = false;
    if (verifiedUid !== uid) {
      const adminSnap = await adminDb.doc(`admin_sessions/${verifiedUid}`).get();
      const supSnap = await adminDb.doc(`supervisor_sessions/${verifiedUid}`).get();
      isActiveAdmin = Boolean(adminSnap.exists && adminSnap.data()?.isActive);
      isActiveSupervisor = Boolean(supSnap.exists && supSnap.data()?.isActive);
    }

    if (!canReleaseSession({ actorUid: verifiedUid, targetUid: uid, isActiveAdmin, isActiveSupervisor })) {
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
      const entityRef = adminDb.doc(`${entityColl}/${targetEntityId}`);
      const entitySnap = await entityRef.get();
      if (entitySnap.exists) {
        const data = entitySnap.data() || {};
        const remaining = removeActiveSession(data, sessionId);
        await entityRef.update({
          activeSessionIds: remaining,
          ...(data.currentSessionId === sessionId ? { currentSessionId: remaining.at(-1) ?? null } : {})
        });
      }
    }

    if (secColl && uid) {
      const secSnap = await adminDb.doc(`${secColl}/${uid}`).get();
      if (secSnap.exists) {
        const rootData = secSnap.data() || {};
        const remainingRoot = removeActiveSession(rootData, sessionId);
        const rootWasReleased = rootData.sessionId === sessionId;
        await adminDb.doc(`${secColl}/${uid}`).update({
          activeSessionIds: remainingRoot,
          ...(rootData.currentSessionId === sessionId
            ? { currentSessionId: remainingRoot.at(-1) ?? null }
            : {}),
          ...(rootWasReleased
            ? {
                sessionId: remainingRoot.at(-1) ?? null,
                isActive: remainingRoot.length > 0
              }
            : {}),
          ...(rootWasReleased ? { lastActive: new Date() } : {})
        });
      }
      await adminDb.doc(`${secColl}/${uid}/sessions/${sessionId}`).set({ isActive: false, lastActive: new Date() }, { merge: true });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('[Server Auth] Error in release-session:', e);
    return res.status(500).json({ success: false, error: 'SERVER_ERROR' });
  }
});
