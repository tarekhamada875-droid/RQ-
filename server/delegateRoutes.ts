/**
 * delegate route handlers.
 *
 * Extracted from garageRoutes.ts (Wave 6c). Direct module imports
 * after the C1 part 3 dependency-injection conversion.
 */
import type { WorkerApp } from './cloudflareWorker';
import { adminDb } from './firebaseAdmin';
import { requireWorkerAuth } from './sessionInfrastructure';
import { ValidationError, validateId, validateIdempotencyKey, validateNewPin, validateString } from './validation';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { checkPinAvailabilityAcrossAll, deleteEntityPinInTransaction, saveEntityPinInTransaction } from './pinRepository';
import { canManageDelegates } from './domain/authorization';
import { normalizePhone } from './pinCrypto';
import { writeMaintainedAdminDelta } from './workerMaintenance';

export function registerDelegateRoutes(app: WorkerApp): void {

app.post('/api/delegates/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const retiredField = ['commissionRate', 'commissions', 'balance', 'totalEarned']
      .find((field) => body[field] !== undefined);
    if (retiredField) {
      return c.json({ success: false, error: 'RETIRED_DELEGATE_FIELD', field: retiredField }, 400);
    }
    const { name, phone, pin } = body;

    // Idempotency: a retried delegates/create must not create a duplicate.
    const idempotencyKey = validateIdempotencyKey(
      body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key')
    );
    let requestFingerprint: string | null = null;
    if (idempotencyKey) {
      requestFingerprint = createRequestFingerprint({ name, phone });
    }

    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    // Audit N9 (Phase 1, 2026-11-06): normalize phone consistently with the
    // client's normalizePhone (keeps `+`, strips other non-digits). This
    // ensures delegates created via direct API calls (without client-side
    // normalization) are stored in the same canonical form that the login
    // lookup uses.
    const normPhone = phone ? normalizePhone(phone) : '';
    const normPin = validateNewPin(pin);

    if (!adminDb) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const delRef = adminDb.collection('delegates').doc();
    const delId = delRef.id;

    let resultData: Record<string, any> = { success: true, id: delId };

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey && requestFingerprint) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/delegates/create', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || resultData;
          return;
        }
      }
      await saveEntityPinInTransaction(t, 'delegates', delId, normPin);
      t.set(delRef, {
        name: normName.trim(),
        phone: normPhone,
        totalCommissionEarned: 0,
        totalRechargedAmount: 0,
        createdAt: new Date()
      });
      writeMaintainedAdminDelta(t, { totalDelegates: 1 });
      if (idempotencyKey && requestFingerprint) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/delegates/create', user?.uid, requestFingerprint);
      }
    });

    return c.json(resultData);
  } catch (e: any) {
    console.error('[Worker Delegate] Error in create:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/delegates/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canManageDelegates(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id, name, phone, pin } = body;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const delegateId = validateId(id, 'id', true);
    const retiredField = ['commissionRate', 'commissions', 'balance', 'totalEarned']
      .find((field) => body[field] !== undefined);
    if (retiredField) {
      return c.json({ success: false, error: 'RETIRED_DELEGATE_FIELD', field: retiredField }, 400);
    }
    const unsupportedFields = Object.keys(body).filter((field) =>
      !['id', 'name', 'phone', 'pin'].includes(field)
    );
    if (unsupportedFields.length > 0) {
      return c.json({ success: false, error: `UNSUPPORTED_FIELDS: ${unsupportedFields.join(',')}` }, 400);
    }

    const normalizedPin = pin ? validateNewPin(pin, 'newPin') : null;
    if (normalizedPin) {
      const pinCheck = await checkPinAvailabilityAcrossAll(normalizedPin, delegateId);
      if (pinCheck.taken) return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();

    const delegateRef = adminDb.collection('delegates').doc(delegateId);
    await adminDb.runTransaction(async (t: any) => {
      const delegateSnap = await t.get(delegateRef);
      if (!delegateSnap.exists) throw new Error('DELEGATE_NOT_FOUND');
      if (normalizedPin) await saveEntityPinInTransaction(t, 'delegates', delegateId, normalizedPin);
      t.update(delegateRef, updates);
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in update:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e?.message === 'DELEGATE_NOT_FOUND') return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/delegates/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canManageDelegates(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id } = body;
    if (!id || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const delegateId = validateId(id, 'id', true);
    const delegateRef = adminDb.collection('delegates').doc(delegateId);
    let missingDelegate = false;
    let unsettledCycleTotal = 0;
    await adminDb.runTransaction(async (t: any) => {
      const delegateSnap = await t.get(delegateRef);
      if (!delegateSnap.exists) {
        missingDelegate = true;
        return;
      }
      const delegateData = delegateSnap.data() || {};
      unsettledCycleTotal = Number(delegateData.totalRechargedAmount || 0);
      if (!Number.isFinite(unsettledCycleTotal) || unsettledCycleTotal !== 0) return;
      await deleteEntityPinInTransaction(t, 'delegates', delegateId);
      t.delete(delegateRef);
      // Atomically decrement the admin-summary counter inside the transaction.
      writeMaintainedAdminDelta(t, { totalDelegates: -1 });
    });
    if (missingDelegate) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    if (!Number.isFinite(unsettledCycleTotal) || unsettledCycleTotal !== 0) {
      return c.json({
        success: false,
        error: 'DELEGATE_HAS_UNSETTLED_COMMISSION',
        unsettledCycleTotal
      }, 409);
    }

    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

}
