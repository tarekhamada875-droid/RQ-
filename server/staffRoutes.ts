/**
 * staff route handlers.
 *
 * Extracted from garageRoutes.ts (Wave 6c). Imports deps from the
 * shared GarageRouteDeps interface defined in garageRoutes.ts.
 */
import type { WorkerApp } from './cloudflareWorker';
import type { GarageRouteDeps } from './garageRoutes';

export function registerStaffRoutes(app: WorkerApp, deps: GarageRouteDeps): void {
  const {
    getAdminDb,
    getAdminAuth,
    requireWorkerAuth,
    ValidationError,
    validateNewPin,
    validateIdempotencyKey,
    validateId,
    validateString,
    checkPinAvailabilityAcrossAll,
    createRequestFingerprint,
    checkIdempotencyInTransaction,
    storeIdempotencyInTransaction,
    saveEntityPinInTransaction,
    deleteEntityPinInTransaction,
    canManageStaffForGarage,
  } = deps;

app.post('/api/staff/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { name, phone, pin, garageId, role, permissions } = body;
    if (!canManageStaffForGarage(user, garageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot add staff to this garage' }, 403);
    }

    // Idempotency: a retried staff/create (e.g. after a network blip) must not
    // create a duplicate staff entity. The key is optional but recommended.
    const idempotencyKey = validateIdempotencyKey(
      body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key')
    );
    let requestFingerprint: string | null = null;
    if (idempotencyKey) {
      requestFingerprint = createRequestFingerprint({ name, phone, garageId, role });
    }

    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(pin);

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const staffRef = getAdminDb().collection('staff').doc();
    const staffId = staffRef.id;

    let resultData: Record<string, any> = { success: true, id: staffId };

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey && requestFingerprint) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/staff/create', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || resultData;
          return;
        }
      }
      await saveEntityPinInTransaction(t, 'staff', staffId, normPin);
      t.set(staffRef, {
        name: normName.trim(),
        phone: phone ? String(phone).trim() : '',
        garageId,
        role: role || 'worker',
        permissions: permissions || {},
        createdAt: new Date()
      });
      if (idempotencyKey && requestFingerprint) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/staff/create', user?.uid, requestFingerprint);
      }
    });

    return c.json(resultData);
  } catch (e: any) {
    console.error('[Worker Staff] Error in create:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/staff/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id, name, phone, role, permissions, pin } = body;
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const staffId = validateId(id, 'id', true);
    const staffRef = getAdminDb().collection('staff').doc(staffId);

    // Authorize the target before checking global PIN uniqueness, which otherwise
    // lets callers probe whether a PIN is already assigned outside their garage.
    const initialStaffSnap = await staffRef.get();
    if (!initialStaffSnap.exists) throw new Error('STAFF_NOT_FOUND');
    if (!canManageStaffForGarage(user, initialStaffSnap.data()?.garageId)) {
      throw new Error('FORBIDDEN: Cannot update staff outside your garage');
    }

    const normalizedPin = pin ? validateNewPin(pin, 'newPin') : null;
    if (normalizedPin) {
      const pinCheck = await checkPinAvailabilityAcrossAll(normalizedPin, staffId);
      if (pinCheck.taken) return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (role) updates.role = role;
    if (permissions) updates.permissions = permissions;

    await getAdminDb().runTransaction(async (t: any) => {
      const targetStaffSnap = await t.get(staffRef);
      if (!targetStaffSnap.exists) throw new Error('STAFF_NOT_FOUND');
      if (!canManageStaffForGarage(user, targetStaffSnap.data()?.garageId)) {
        throw new Error('FORBIDDEN: Cannot update staff outside your garage');
      }
      if (normalizedPin) await saveEntityPinInTransaction(t, 'staff', staffId, normalizedPin);
      t.update(staffRef, updates);
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Staff] Error in update:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e?.message === 'STAFF_NOT_FOUND') return c.json({ success: false, error: 'STAFF_NOT_FOUND' }, 404);
    if (String(e?.message || '').includes('FORBIDDEN')) return c.json({ success: false, error: 'FORBIDDEN: Cannot update staff outside your garage' }, 403);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/staff/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id } = body;
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const staffId = validateId(id, 'id', true);
    const staffRef = getAdminDb().collection('staff').doc(staffId);

    // 1. Verify authorization and read the staff doc before mutation.
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      if (user?.role === 'admin') return c.json({ success: true, alreadyDeleted: true });
      return c.json({ success: false, error: 'STAFF_NOT_FOUND' }, 404);
    }
    const staffData = staffSnap.data() || {};
    if (user?.role !== 'admin' && !canManageStaffForGarage(user, staffData.garageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot delete staff outside your garage' }, 403);
    }

    // 2. Revoke all active sessions for this staff member BEFORE deleting the doc.
    const now = new Date();
    let revokedSessions = 0;
    const crypto = await import('crypto');
    const hashSessionId = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
    const staffSessionsSnap = await getAdminDb().collection('staff_sessions')
      .where('entityId', '==', staffId)
      .get();
    const adminAuthInstance = getAdminAuth();
    const uidsToDelete: string[] = [];
    let sessionBatch = getAdminDb().batch();
    let sessionBatchWrites = 0;
    for (const sessionDoc of staffSessionsSnap.docs) {
      const sessionData = sessionDoc.data() || {};
      const uid = sessionData.uid;
      if (uid && !uidsToDelete.includes(uid)) uidsToDelete.push(uid);
      if (sessionData.isActive === true) revokedSessions += 1;
      sessionBatch.update(sessionDoc.ref, { isActive: false, lastActive: now });
      sessionBatchWrites += 1;
      if (sessionData.uid && sessionData.sessionId) {
        sessionBatch.set(getAdminDb().doc(`session_index/${hashSessionId(`${sessionData.uid}:${sessionData.sessionId}`)}`), { isActive: false, updatedAt: now }, { merge: true });
        sessionBatchWrites += 1;
      }
      const deviceSessions = await getAdminDb().collection(`staff_sessions/${sessionDoc.id}/sessions`).get();
      for (const deviceDoc of deviceSessions.docs) {
        const deviceData = deviceDoc.data() || {};
        if (deviceData.isActive === true) revokedSessions += 1;
        sessionBatch.update(deviceDoc.ref, { isActive: false, lastActive: now });
        sessionBatchWrites += 1;
        if (deviceData.uid && deviceData.sessionId) {
          sessionBatch.set(getAdminDb().doc(`session_index/${hashSessionId(`${deviceData.uid}:${deviceData.sessionId}`)}`), { isActive: false, updatedAt: now }, { merge: true });
          sessionBatchWrites += 1;
        }
        if (sessionBatchWrites >= 450) { await sessionBatch.commit(); sessionBatch = getAdminDb().batch(); sessionBatchWrites = 0; }
      }
      if (sessionBatchWrites >= 450) { await sessionBatch.commit(); sessionBatch = getAdminDb().batch(); sessionBatchWrites = 0; }
    }
    if (sessionBatchWrites > 0) await sessionBatch.commit();

    // 3. Delete the staff doc and its PIN atomically.
    await getAdminDb().runTransaction(async (t: any) => {
      await deleteEntityPinInTransaction(t, 'staff', staffId);
      t.delete(staffRef);
    });

    // 4. Delete the Firebase Auth user(s) — prevents any future login.
    let deletedAuthUsers = 0;
    if (adminAuthInstance) {
      for (const uid of uidsToDelete) {
        try {
          await adminAuthInstance.deleteUser(uid);
          deletedAuthUsers += 1;
        } catch (err: any) {
          console.warn(`[Worker Staff] Could not delete Auth user ${uid} for staff ${staffId}:`, err?.message || err);
        }
      }
    }

    // 5. Delete this staff member's activity history.
    let deletedActivityLogs = 0;
    let activityBatch = getAdminDb().batch();
    let activityBatchWrites = 0;
    const activitySnap = await getAdminDb().collection('activity_logs')
      .where('staffId', '==', staffId)
      .get();
    for (const doc of activitySnap.docs) {
      activityBatch.delete(doc.ref);
      activityBatchWrites += 1;
      deletedActivityLogs += 1;
      if (activityBatchWrites >= 450) { await activityBatch.commit(); activityBatch = getAdminDb().batch(); activityBatchWrites = 0; }
    }
    if (activityBatchWrites > 0) await activityBatch.commit();

    return c.json({ success: true, revokedSessions, deletedAuthUsers, deletedActivityLogs });
  } catch (e: any) {
    console.error('[Worker Staff] Error in delete:', e);
    if (String(e?.message || '').includes('FORBIDDEN')) return c.json({ success: false, error: 'FORBIDDEN: Cannot delete staff outside your garage' }, 403);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

}
