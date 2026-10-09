import { Router } from 'express';
import { adminDb } from '../firebaseAdmin';
import { requireAuth, AuthRequest, sendApiError } from '../middleware';
import { hashSessionId, removeActiveSession, toSessionSummary } from './sessionMarkers';
import { canInvalidateAllSessions } from '../domain/authorization';

export const activeSessionsRouter = Router();

const sessionCollections: Record<string, { sessions: string; entity: string }> = {
  admin: { sessions: 'admin_sessions', entity: 'admin_settings' },
  delegate: { sessions: 'delegate_sessions', entity: 'delegates' },
  garage: { sessions: 'garage_sessions', entity: 'garages' },
  staff: { sessions: 'staff_sessions', entity: 'staff' }
};

// Return only redacted session summaries. Raw session IDs never leave the backend.
activeSessionsRouter.get('/api/auth/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!adminDb || !req.user?.uid || req.user.uid === 'backend-operator') {
      return sendApiError(res, 403, 'FORBIDDEN', 'SESSION_MANAGEMENT_REQUIRES_USER_SESSION', req.correlationId);
    }
    const definition = sessionCollections[req.user.role];
    if (!definition) return sendApiError(res, 403, 'FORBIDDEN', 'SESSION_MANAGEMENT_ROLE_NOT_ALLOWED', req.correlationId);

    const rootRef = adminDb.doc(`${definition.sessions}/${req.user.uid}`);
    const [rootSnap, deviceSnap] = await Promise.all([
      rootRef.get(),
      rootRef.collection('sessions').get()
    ]);
    const summaries = deviceSnap.docs.map((doc) => toSessionSummary(doc.id, doc.data() || {}, req.user?.sessionId));
    if (summaries.length === 0 && rootSnap.exists && rootSnap.data()?.isActive === true && req.user.sessionId) {
      summaries.push(toSessionSummary(req.user.sessionId, rootSnap.data() || {}, req.user.sessionId));
    }
    return res.json({ success: true, sessions: summaries });
  } catch (error) {
    console.error('[Server Auth] Error listing sessions:', error);
    return sendApiError(res, 500, 'INTERNAL_ERROR', 'SESSION_LIST_FAILED', req.correlationId);
  }
});

// Revoke one of the caller's own devices using only its redacted session ID.
activeSessionsRouter.delete('/api/auth/sessions/:sessionKey', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!adminDb || !req.user?.uid || req.user.uid === 'backend-operator') {
      return sendApiError(res, 403, 'FORBIDDEN', 'SESSION_MANAGEMENT_REQUIRES_USER_SESSION', req.correlationId);
    }
    const definition = sessionCollections[req.user.role];
    const sessionKey = String(req.params.sessionKey || '').trim();
    if (!definition || !/^[a-f0-9]{64}$/.test(sessionKey)) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'INVALID_SESSION_KEY', req.correlationId);
    }

    const rootRef = adminDb.doc(`${definition.sessions}/${req.user.uid}`);
    const [rootSnap, deviceSnap] = await Promise.all([rootRef.get(), rootRef.collection('sessions').get()]);
    const target = deviceSnap.docs.find((doc) => hashSessionId(doc.id) === sessionKey);
    if (!target) return sendApiError(res, 404, 'NOT_FOUND', 'SESSION_NOT_FOUND', req.correlationId);

    const targetData = target.data() || {};
    const entityId = req.user.role === 'admin' ? 'auth_pin' : targetData.entityId;
    const entityRef = entityId ? adminDb.doc(`${definition.entity}/${entityId}`) : null;
    const entitySnap = entityRef ? await entityRef.get() : null;
    const remainingRoot = removeActiveSession(rootSnap.data() || {}, target.id);
    const remainingEntity = entitySnap?.exists ? removeActiveSession(entitySnap.data() || {}, target.id) : [];
    const batch = adminDb.batch();
    batch.set(target.ref, { isActive: false, lastActive: new Date() }, { merge: true });
    batch.set(rootRef, {
      activeSessionIds: remainingRoot,
      ...(rootSnap.data()?.currentSessionId === target.id
        ? { currentSessionId: remainingRoot.at(-1) ?? null }
        : {})
    }, { merge: true });
    if (entityRef && entitySnap?.exists) {
      batch.set(entityRef, {
        activeSessionIds: remainingEntity,
        ...(entitySnap.data()?.currentSessionId === target.id ? { currentSessionId: remainingEntity.at(-1) ?? null } : {})
      }, { merge: true });
    }
    await batch.commit();
    return res.json({ success: true, revokedSession: sessionKey, wasCurrent: target.id === req.user.sessionId });
  } catch (error) {
    console.error('[Server Auth] Error revoking session:', error);
    return sendApiError(res, 500, 'INTERNAL_ERROR', 'SESSION_REVOKE_FAILED', req.correlationId);
  }
});

// Admin-only maintenance: invalidate every active login session without changing
// passwords, account records, vehicles, subscribers, balances, or subscriptions.
activeSessionsRouter.post('/api/auth/invalidate-all-sessions', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (!canInvalidateAllSessions(req.user)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    if (!adminDb) {
      return res.status(503).json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' });
    }

    const now = new Date();
    const sessionCollList = [
      { name: 'admin_sessions', entityCollection: 'admin_settings', fixedEntityId: 'auth_pin' },
      { name: 'delegate_sessions', entityCollection: 'delegates' },
      { name: 'garage_sessions', entityCollection: 'garages' },
      { name: 'staff_sessions', entityCollection: 'staff' }
    ];

    const snapshots = await Promise.all(sessionCollList.map((entry) => adminDb.collection(entry.name).get()));
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

    for (let index = 0; index < sessionCollList.length; index += 1) {
      const entry = sessionCollList[index];
      for (const sessionDoc of snapshots[index].docs) {
        const sessionData = sessionDoc.data() || {};
        if (sessionData.isActive === true) invalidatedSessions += 1;
        batch.update(sessionDoc.ref, { isActive: false, lastActive: now });
        batchWrites += 1;

        const entityId = entry.fixedEntityId || sessionData.entityId;
        if (entityId) {
          const entityRef = adminDb.doc(`${entry.entityCollection}/${entityId}`);
          batch.set(entityRef, { currentSessionId: null, activeSessionIds: [], lastActive: now }, { merge: true });
          batchWrites += 1;
          clearedEntityMarkers += 1;
        }
        const deviceSessions = await adminDb.collection(`${entry.name}/${sessionDoc.id}/sessions`).get();
        for (const deviceSession of deviceSessions.docs) {
          if (deviceSession.data()?.isActive === true) invalidatedSessions += 1;
          batch.update(deviceSession.ref, { isActive: false, lastActive: now });
          batchWrites += 1;
          await commitBatchIfNeeded();
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
