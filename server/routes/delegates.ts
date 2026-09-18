import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { recordDomainEventInTransaction } from '../events';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction, createRequestFingerprint } from '../idempotency';
import { saveEntityPin, checkPinAvailabilityAcrossAll } from '../utils';
import { validateString, validateNewPin, validateIdempotencyKey, ValidationError } from '../validation';

const router = Router();

// Secure Server API: Create Delegate (Admin Only)
router.post('/create', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    const { name, phone, pin, commissionRate, commissions, defaultTrialDays } = req.body || {};
    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    const normPhone = phone ? String(phone).trim() : '';
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
    if (e instanceof ValidationError) {
      return res.status(e.statusCode).json({ success: false, error: `INVALID_PIN: ${e.message}` });
    }
    return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
  }
});

// Secure Server API: Update Delegate
router.post('/update', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (!['admin', 'supervisor'].includes(req.user?.role || '')) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin or Supervisor role required' });
    }
    const { id, name, phone, commissionRate, commissions, defaultTrialDays } = req.body || {};
    if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const unsupportedFields = Object.keys(req.body || {}).filter((field) =>
      !['id', 'name', 'phone', 'commissionRate', 'commissions', 'defaultTrialDays'].includes(field)
    );
    if (unsupportedFields.length > 0) {
      return res.status(400).json({ success: false, error: `UNSUPPORTED_FIELDS: ${unsupportedFields.join(',')}` });
    }

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

// Secure Server API: Settle a delegate's current financial cycle (Admin Only)
router.post('/settle-account', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN: Admin role required' });
    }
    const { id } = req.body || {};
    if (!id || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);
    const requestFingerprint = createRequestFingerprint({ id });
    const delRef = adminDb.collection('delegates').doc(id);
    const now = new Date();
    let previousTotal = 0;
    let duplicateResult: any = null;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/delegates/settle-account', req.user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          duplicateResult = duplicate.cachedResult;
          return;
        }
      }
      const snap = await t.get(delRef);
      if (!snap.exists) throw new Error('DELEGATE_NOT_FOUND');
      const data = snap.data() || {};
      previousTotal = Number(data.totalRechargedAmount || 0);
      t.update(delRef, {
        lastSettledAt: now,
        totalRechargedAmount: 0,
        updatedAt: now
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId: 'global',
        aggregateType: 'delegate',
        aggregateId: id,
        eventType: 'delegate_settled',
        actorUid: req.user?.uid || 'admin',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        eventCollectionPath: `delegates/${id}/events`,
        payload: {
          delegateId: id,
          previousRechargedAmount: previousTotal,
          settledAt: now.toISOString()
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t,
          idempotencyKey,
          { success: true, settledAt: now.toISOString(), previousRechargedAmount: previousTotal },
          '/api/delegates/settle-account',
          req.user?.uid,
          requestFingerprint
        );
      }
    });

    if (duplicateResult) return res.json(duplicateResult);
    return res.json({ success: true, settledAt: now.toISOString(), previousRechargedAmount: previousTotal });
  } catch (e: any) {
    console.error('[Server Delegate] Error settling account:', e);
    return res.status(500).json({ success: false, error: e?.message || 'SERVER_ERROR' });
  }
});

// Secure Server API: Delete Delegate
router.post('/delete', requireAuth, async (req: AuthRequest, res: any) => {
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

export default router;
