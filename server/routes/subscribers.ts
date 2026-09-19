import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction } from '../idempotency';
import { recordDomainEventInTransaction } from '../events';
import { validateDateRange, validatePlate, validateId, validateIdempotencyKey } from '../validation';
import { mapDomainErrorToStatus, canManageGarageScopedData } from './helpers';

const router = Router();

// Secure Server API: Subscribers (Add)
router.post('/add', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role || 'garage';
    const { garageId, subscriberData } = req.body || {};
    if (!garageId || !subscriberData || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!canManageGarageScopedData(req, validatedGarageId)) return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' });
    const dates = validateDateRange(subscriberData.startDate, subscriberData.endDate);
    const { plateNumber, plateRaw } = validatePlate(subscriberData.plateNumberRaw || subscriberData.plateNumber);
    const { costUnits: _costUnits, id: _id, createdAt: _createdAt, plateNumber: _clientPlate, plateNumberRaw: _clientPlateRaw, ...subscriberFields } = subscriberData;
    const subscriberCollection = adminDb.collection(`garages/${validatedGarageId}/subscribers`);
    const subscriberId = `plate_${Buffer.from(plateRaw).toString('base64url')}`;
    const docRef = subscriberCollection.doc(subscriberId);
    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);
    let resultData: { id: string } = { id: subscriberId };

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/add', req.user?.uid);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || resultData;
          return;
        }
      }
      const deterministicSnap = await t.get(docRef);
      const legacyMatches = await t.get(subscriberCollection.where('plateNumberRaw', '==', plateRaw).limit(1));
      if (deterministicSnap.exists || !legacyMatches.empty) {
        throw new Error('SUBSCRIBER_ALREADY_EXISTS');
      }
      t.set(docRef, {
        ...subscriberFields,
        plateNumber,
        plateNumberRaw: plateRaw,
        ...dates,
        garageId: validatedGarageId,
        id: docRef.id,
        createdAt: new Date()
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_created',
        actorUid: req.user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          plateNumber,
          plateNumberRaw: plateRaw,
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/subscribers/add', req.user?.uid);
      }
    });

    return res.json({ success: true, id: resultData.id });
  } catch (e: any) {
    console.error('[Server Subscribers] Error in add:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Subscribers (Renew)
router.post('/renew', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role || 'garage';
    const { garageId, subscriberId, newDates } = req.body || {};
    if (!garageId || !subscriberId || !newDates || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!canManageGarageScopedData(req, validatedGarageId)) return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' });
    const dates = validateDateRange(newDates.startDate, newDates.endDate);
    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);
    const subscriberRef = adminDb.collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/renew', req.user?.uid);
        if (duplicate.isDuplicate) return;
      }
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      t.update(subscriberRef, { startDate: dates.startDate, endDate: dates.endDate });
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_renewed',
        actorUid: req.user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      });
      if (idempotencyKey) storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/renew', req.user?.uid);
    });

    return res.json({ success: true });
  } catch (e: any) {
    console.error('[Server Subscribers] Error in renew:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Subscribers (Update)
router.post('/update', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role || 'garage';
    const { garageId, subscriberId, subscriberData } = req.body || {};
    if (!garageId || !subscriberId || !subscriberData || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!canManageGarageScopedData(req, validatedGarageId)) return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' });
    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);
    const subscriberRef = adminDb.collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/update', req.user?.uid);
        if (duplicate.isDuplicate) return;
      }
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      const currentData = currentSnap.data() || {};
      if (subscriberData.plateNumber !== undefined || subscriberData.plateNumberRaw !== undefined) {
        const requestedPlate = validatePlate(subscriberData.plateNumberRaw || subscriberData.plateNumber);
        const currentPlate = validatePlate(currentData.plateNumberRaw || currentData.plateNumber);
        if (requestedPlate.plateRaw !== currentPlate.plateRaw) {
          throw new Error('SUBSCRIBER_PLATE_IMMUTABLE');
        }
      }
      const mergedData = { ...currentData, ...subscriberData };
      const dates = validateDateRange(mergedData.startDate, mergedData.endDate);
      const safeUpdates: Record<string, any> = { ...dates };
      for (const key of ['ownerName', 'phone', 'notes']) {
        if (key in subscriberData) safeUpdates[key] = subscriberData[key];
      }
      t.update(subscriberRef, safeUpdates);
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_updated',
        actorUid: req.user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      });
      if (idempotencyKey) storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/update', req.user?.uid);
    });
    return res.json({ success: true });
  } catch (e: any) {
    console.error('[Server Subscribers] Error in update:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

// Secure Server API: Subscribers (Delete)
router.post('/delete', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const callerRole = req.user?.role || 'garage';
    const { garageId, subscriberId } = req.body || {};
    if (!garageId || !subscriberId || !adminDb) return res.status(400).json({ success: false, error: 'INVALID_REQUEST' });
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!canManageGarageScopedData(req, validatedGarageId)) return res.status(403).json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' });
    const idempotencyKey = validateIdempotencyKey(req.body?.idempotencyKey || req.headers['x-idempotency-key'] || req.headers['idempotency-key']);
    const subscriberRef = adminDb.collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/delete', req.user?.uid);
        if (duplicate.isDuplicate) return;
      }
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      t.delete(subscriberRef);
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_deleted',
        actorUid: req.user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {}
      });
      if (idempotencyKey) storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/delete', req.user?.uid);
    });
    return res.json({ success: true });
  } catch (e: any) {
    console.error('[Server Subscribers] Error in delete:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return res.status(statusCode).json({ success: false, error: message });
  }
});

export default router;
