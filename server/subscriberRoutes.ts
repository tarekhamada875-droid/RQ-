import type { WorkerApp } from './cloudflareWorker';
import { lookupSubscriber, safeDateMillis } from './workerReadHelpers';

export type SubscriberRouteDependency = (...args: any[]) => any;

export interface SubscriberRouteDeps {
  getAdminDb: () => any;
  requireWorkerAuth: SubscriberRouteDependency;
  decideGarageScope: SubscriberRouteDependency;
  validateId: SubscriberRouteDependency;
  validateDateRange: SubscriberRouteDependency;
  validatePlate: SubscriberRouteDependency;
  validateIdempotencyKey: SubscriberRouteDependency;
  mapDomainErrorToStatus: SubscriberRouteDependency;
  checkIdempotencyInTransaction: SubscriberRouteDependency;
  createRequestFingerprint: SubscriberRouteDependency;
  storeIdempotencyInTransaction: SubscriberRouteDependency;
  recordDomainEventInTransaction: SubscriberRouteDependency;
  decideSubscriberAdd: SubscriberRouteDependency;
  decideSubscriberDelete: SubscriberRouteDependency;
  decideSubscriberRenew: SubscriberRouteDependency;
  decideSubscriberUpdate: SubscriberRouteDependency;
  addRequestToCommand: SubscriberRouteDependency;
  lifecycleErrorToLegacyError: SubscriberRouteDependency;
  subscriberDocumentToState: SubscriberRouteDependency;
  transitionToFirestoreUpdate: SubscriberRouteDependency;
  updateRequestToCommand: SubscriberRouteDependency;
  debitSubscriberRenewal: SubscriberRouteDependency;
  materializeCreditLedgerEntry: SubscriberRouteDependency;
  maintainedGarageSummaryRef: SubscriberRouteDependency;
  writeMaintainedGarageDelta: SubscriberRouteDependency;
  writeMaintainedSubscriberDelta: SubscriberRouteDependency;
}

function subscriberActivityDelta(before: any, after: any): { activeSubscribersCount: number; expiredSubscribersCount: number; activeSubscribers: number; expiredSubscribers: number } {
  const classify = (value: any) => {
    if (!value) return { active: 0, expired: 0 };
    const active = safeDateMillis(value.endDate) === 0 || safeDateMillis(value.endDate) >= Date.now();
    return { active: Number(active), expired: Number(!active) };
  };
  const beforeCounts = classify(before);
  const afterCounts = classify(after);
  return {
    activeSubscribersCount: afterCounts.active - beforeCounts.active,
    expiredSubscribersCount: afterCounts.expired - beforeCounts.expired,
    activeSubscribers: afterCounts.active - beforeCounts.active,
    expiredSubscribers: afterCounts.expired - beforeCounts.expired
  };
}



export function registerSubscriberRoutes(app: WorkerApp, deps: SubscriberRouteDeps): void {
  const {
    getAdminDb,
    requireWorkerAuth,
    decideGarageScope,
    validateId,
    validateDateRange,
    validatePlate,
    validateIdempotencyKey,
    mapDomainErrorToStatus,
    checkIdempotencyInTransaction,
    createRequestFingerprint,
    storeIdempotencyInTransaction,
    recordDomainEventInTransaction,
    decideSubscriberAdd,
    decideSubscriberDelete,
    decideSubscriberRenew,
    decideSubscriberUpdate,
    addRequestToCommand,
    lifecycleErrorToLegacyError,
    subscriberDocumentToState,
    transitionToFirestoreUpdate,
    updateRequestToCommand,
    debitSubscriberRenewal,
    materializeCreditLedgerEntry,
    maintainedGarageSummaryRef,
    writeMaintainedGarageDelta,
    writeMaintainedSubscriberDelta
  } = deps;
// 8. Subscriber Lifecycle Management (CF6)

// Route 1: POST /api/subscribers/add
app.post('/api/subscribers/add', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberData } = body;
    if (!garageId || !subscriberData || !getAdminDb()) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const dates = validateDateRange(subscriberData.startDate, subscriberData.endDate);
    const { plateNumber, plateRaw } = validatePlate(subscriberData.plateNumberRaw || subscriberData.plateNumber);
    const { costUnits: _costUnits, id: _id, createdAt: _createdAt, plateNumber: _clientPlate, plateNumberRaw: _clientPlateRaw, ...subscriberFields } = subscriberData;
    const subscriberCollection = getAdminDb().collection(`garages/${validatedGarageId}/subscribers`);
    const subscriberId = `plate_${Buffer.from(plateRaw).toString('base64url')}`;
    const docRef = subscriberCollection.doc(subscriberId);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberData: { ...subscriberFields, plateNumber, plateNumberRaw: plateRaw, ...dates } });
    let resultData: { id: string } = { id: subscriberId };

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/add', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || resultData;
          return;
        }
      }
      const existingSubscriber = await lookupSubscriber(subscriberCollection, { plateRaw, plateNumber }, (target) => t.get(target));
      if (existingSubscriber) {
        throw new Error('SUBSCRIBER_ALREADY_EXISTS');
      }
      const maintainedGarageSnap = await t.get(maintainedGarageSummaryRef(validatedGarageId));
      const maintainedGarage = maintainedGarageSnap.exists ? maintainedGarageSnap.data() || {} : {};
      const activeSubscriber = safeDateMillis(dates.endDate) === 0 || safeDateMillis(dates.endDate) >= Date.now();
      const garageDelta = {
        totalSubscribersCount: 1,
        activeSubscribersCount: activeSubscriber ? 1 : 0,
        expiredSubscribersCount: activeSubscriber ? 0 : 1
      };
      writeMaintainedGarageDelta(t, validatedGarageId, garageDelta, { garageId: validatedGarageId });
      writeMaintainedSubscriberDelta(t, {
        totalSubscribers: 1,
        activeSubscribers: activeSubscriber ? 1 : 0,
        expiredSubscribers: activeSubscriber ? 0 : 1,
        garagesCount: Number(maintainedGarage.totalSubscribersCount || 0) === 0 ? 1 : 0
      });
      const decision = decideSubscriberAdd(null, addRequestToCommand(subscriberData, { plateNumber, plateRaw }, dates));
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      t.set(docRef, {
        ...subscriberFields,
        plateNumber,
        plateNumberRaw: plateRaw,
        ...dates,
        garageId: validatedGarageId,
        id: docRef.id,
        createdAt: new Date()
      });
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_created',
        actorUid: user?.uid || 'system',
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
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/subscribers/add', user?.uid, requestFingerprint);
      }
    });

    return c.json({ success: true, id: resultData.id });
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in add:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 2: POST /api/subscribers/renew
app.post('/api/subscribers/renew', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberId, newDates } = body;
    if (!garageId || !subscriberId || !newDates || !getAdminDb()) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const dates = validateDateRange(newDates.startDate, newDates.endDate);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const subscriberRef = getAdminDb().collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    const garageRef = getAdminDb().collection('garages').doc(validatedGarageId);
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberId, newDates: dates });
    let resultData: any = { success: true };

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/renew', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          resultData = duplicate.cachedResult || resultData;
          return;
        }
      }
      const garageSnap = await t.get(garageRef);
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      const currentState = subscriberDocumentToState(currentSnap.data() || {});
      const decision = decideSubscriberRenew(currentState, dates);
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      const garageData = garageSnap.exists ? (garageSnap.data() || {}) : {};
      const prepaidCreditsEnabled = garageData.billingModel === 'prepaid_credits' || garageData.creditBalance !== undefined;

      // A retried renewal may arrive without an idempotency key. Once the requested
      // date range is already persisted, treat it as a no-op rather than debiting
      // the same five paid credits again (and overwriting the deterministic ledger ID).
      if (
        prepaidCreditsEnabled
        && currentState.startDate === dates.startDate
        && currentState.endDate === dates.endDate
      ) {
        resultData = {
          success: true,
          creditBalance: {
            paid: Number(garageData.creditBalance?.paid || 0),
            referral: Number(garageData.creditBalance?.referral || 0),
            trial: Number(garageData.creditBalance?.trial || 0),
          },
        };
        return;
      }

      let creditDebit: any = null;
      if (prepaidCreditsEnabled) {
        const renewalReference = `${subscriberId}:${dates.startDate}:${dates.endDate}`;
        const renewalKey = idempotencyKey || `subscriber-renewal:${renewalReference}`;
        const creditResult = debitSubscriberRenewal({
          balance: {
            paid: Number(garageData.creditBalance?.paid || 0),
            referral: Number(garageData.creditBalance?.referral || 0),
            trial: Number(garageData.creditBalance?.trial || 0),
          },
          amount: 5,
          garageId: validatedGarageId,
          actorUid: user?.uid || 'system',
          actorRole: callerRole,
          reason: 'monthly_subscriber_renewal',
          reference: renewalReference,
          occurredAt: new Date().toISOString(),
          idempotencyKey: renewalKey,
        });
        if (creditResult.ok === false) throw new Error(creditResult.error);
        const materialized = materializeCreditLedgerEntry(creditResult.value.entry);
        if (materialized.ok === false) throw new Error(materialized.error);
        creditDebit = { ...creditResult.value, entry: materialized.value };
        t.set(getAdminDb().doc(`credit_ledger/${materialized.value.entryId}`), materialized.value);
        t.set(garageRef, { creditBalance: creditDebit.balance }, { merge: true });
      }
      const activityDelta = subscriberActivityDelta(currentSnap.data() || {}, { ...currentSnap.data(), ...dates });
      writeMaintainedGarageDelta(t, validatedGarageId, {
        activeSubscribersCount: activityDelta.activeSubscribersCount,
        expiredSubscribersCount: activityDelta.expiredSubscribersCount
      }, { garageId: validatedGarageId });
      writeMaintainedSubscriberDelta(t, {
        activeSubscribers: activityDelta.activeSubscribers,
        expiredSubscribers: activityDelta.expiredSubscribers
      });
      t.update(subscriberRef, {
        startDate: decision.value.state?.startDate,
        endDate: decision.value.state?.endDate
      });
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_renewed',
        actorUid: user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          startDate: dates.startDate,
          endDate: dates.endDate,
          ...(creditDebit ? {
            creditAmount: creditDebit.entry.amount,
            creditBucket: creditDebit.entry.bucket,
            creditLedgerEntryId: creditDebit.entry.entryId,
          } : {})
        }
      });
      resultData = {
        success: true,
        ...(creditDebit ? {
          creditBalance: creditDebit.balance,
          creditDebit: {
            amount: creditDebit.entry.amount,
            bucket: creditDebit.entry.bucket,
            ledgerEntryId: creditDebit.entry.entryId,
          },
        } : {}),
      };
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/subscribers/renew', user?.uid, requestFingerprint);
      }
    });
    return c.json(resultData);
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in renew:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 3: POST /api/subscribers/update
app.post('/api/subscribers/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberId } = body;
    const subscriberData = body.subscriberData || body.updates || {};
    if (!garageId || !subscriberId || !subscriberData || !getAdminDb()) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const subscriberRef = getAdminDb().collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberId, subscriberData });

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/update', user?.uid, requestFingerprint);
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
      const currentState = subscriberDocumentToState(currentData);
      const decision = decideSubscriberUpdate(currentState, updateRequestToCommand(mergedData, currentState, dates));
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      const activityDelta = subscriberActivityDelta(currentData, mergedData);
      writeMaintainedGarageDelta(t, validatedGarageId, {
        activeSubscribersCount: activityDelta.activeSubscribersCount,
        expiredSubscribersCount: activityDelta.expiredSubscribersCount
      }, { garageId: validatedGarageId });
      writeMaintainedSubscriberDelta(t, {
        activeSubscribers: activityDelta.activeSubscribers,
        expiredSubscribers: activityDelta.expiredSubscribers
      });
      t.update(subscriberRef, transitionToFirestoreUpdate(decision.value));
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_updated',
        actorUid: user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {
          startDate: dates.startDate,
          endDate: dates.endDate
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/update', user?.uid, requestFingerprint);
      }
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in update:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Route 4: POST /api/subscribers/delete
app.post('/api/subscribers/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role || 'garage';
    const body = await c.req.json().catch(() => ({}));
    const { garageId, subscriberId } = body;
    if (!garageId || !subscriberId || !getAdminDb()) {
      return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    if (!decideGarageScope(user, validatedGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot manage subscribers for this garage' }, 403);
    }
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    const subscriberRef = getAdminDb().collection(`garages/${validatedGarageId}/subscribers`).doc(validateId(subscriberId, 'subscriberId', true));
    const requestFingerprint = createRequestFingerprint({ garageId: validatedGarageId, subscriberId });

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/subscribers/delete', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) return;
      }
      const currentSnap = await t.get(subscriberRef);
      if (!currentSnap.exists) throw new Error('SUBSCRIBER_NOT_FOUND');
      const currentData = currentSnap.data() || {};
      const decision = decideSubscriberDelete(subscriberDocumentToState(currentData));
      if (decision.ok === false) throw lifecycleErrorToLegacyError(decision.error);
      const maintainedGarageSnap = await t.get(maintainedGarageSummaryRef(validatedGarageId));
      const maintainedGarage = maintainedGarageSnap.exists ? maintainedGarageSnap.data() || {} : {};
      const removesLastGarageSubscriber = Number(maintainedGarage.totalSubscribersCount) === 1;
      const activityDelta = subscriberActivityDelta(currentData, null);
      writeMaintainedGarageDelta(t, validatedGarageId, {
        totalSubscribersCount: -1,
        activeSubscribersCount: activityDelta.activeSubscribersCount,
        expiredSubscribersCount: activityDelta.expiredSubscribersCount
      }, { garageId: validatedGarageId });
      writeMaintainedSubscriberDelta(t, {
        totalSubscribers: -1,
        activeSubscribers: activityDelta.activeSubscribers,
        expiredSubscribers: activityDelta.expiredSubscribers,
        garagesCount: removesLastGarageSubscriber ? -1 : 0
      });
      t.delete(subscriberRef);
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId: validatedGarageId,
        aggregateType: 'subscriber',
        aggregateId: subscriberId,
        eventType: 'subscriber_deleted',
        actorUid: user?.uid || 'system',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: {}
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/subscribers/delete', user?.uid, requestFingerprint);
      }
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Subscribers] Error in delete:', e);
    const { statusCode, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

}
