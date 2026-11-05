/**
 * creditGrant route handlers.
 *
 * Extracted from garageRoutes.ts (Wave 6c). Imports deps from the
 * shared GarageRouteDeps interface defined in garageRoutes.ts.
 */
import type { WorkerApp } from './cloudflareWorker';
import type { GarageRouteDeps } from './garageRoutes';

export function registerCreditGrantRoutes(app: WorkerApp, deps: GarageRouteDeps): void {
  const {
    getAdminDb,
    requireWorkerAuth,
    ValidationError,
    validateNewPin,
    validateIdempotencyKey,
    validateId,
    validateString,
    validateNumber,
    checkPinAvailabilityAcrossAll,
    createRequestFingerprint,
    checkIdempotencyInTransaction,
    storeIdempotencyInTransaction,
    mapDomainErrorToStatus,
    parseMoneyAmount,
    parseFirestorePageRequest,
    firestorePageStartAfter,
    buildFirestorePage,
    canRunGarageMaintenance,
    canUpdateEntityPin,
    saveEntityPin,
    grantPaidCredits,
    awardReferralCredits,
    applyCorrection,
    materializeCreditLedgerEntry,
    recordDomainEventInTransaction,
    writeMaintainedAdminDelta,
    sanitizePayload,
  } = deps;

app.post('/api/people/update-pin', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { entityType, entityId, newPin } = body;
    if (!entityType || !entityId || !['garages', 'delegates', 'staff'].includes(entityType)) {
      return c.json({ success: false, error: 'INVALID_ENTITY_TYPE' }, 400);
    }

    const normNewPin = validateNewPin(newPin, 'newPin');
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let targetGarageId: unknown = entityType === 'garages' ? entityId : undefined;
    if (entityType === 'staff' && user?.role !== 'admin') {
      const targetStaffSnap = await getAdminDb().collection('staff').doc(entityId).get();
      targetGarageId = targetStaffSnap.exists ? targetStaffSnap.data()?.garageId : null;
    }
    if (!canUpdateEntityPin(user, entityType, targetGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Insufficient permissions' }, 403);
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normNewPin, entityId);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    await saveEntityPin(entityType, entityId, normNewPin);

    const targetDocRef = getAdminDb().collection(entityType).doc(entityId);
    const docSnap = await targetDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      const updates: Record<string, any> = { updatedAt: new Date() };
      if ('pin' in data) updates.pin = null;
      if ('ownerPin' in data) updates.ownerPin = null;
      if ('adminPin' in data) updates.adminPin = null;
      if ('pinLookupHash' in data) updates.pinLookupHash = null;
      await targetDocRef.set(updates, { merge: true });
    }

    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker People] Error in update-pin:', e);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_NEW_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Admin Announcements Routes
// Announcements endpoints removed — feature retired by owner.


// Admin Packages Routes removed — feature retired by owner.
// Credit grants now use custom amounts (50-2000 EGP) only.

// Admin confirms offline payment and explicitly grants non-expiring prepaid credits.
// Payment references were removed by owner decision (2026-10-29): grants now take
// just an amount + reason. The 50-2,000 EGP range is enforced. Delegate commission
// (100 EGP once, when the first qualifying paid grant >= 500 EGP) and the
// referral reward (20 credits to the referring garage, same trigger) still fire.
app.post('/api/garages/:id/credit-grants', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'ADMIN_ONLY' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['amount', 'paymentAmountEgp', 'paymentConfirmed', 'reason', 'idempotencyKey'], false);
    if (sanitized.paymentConfirmed !== true) return c.json({ success: false, error: 'PAYMENT_CONFIRMATION_REQUIRED' }, 400);
    const reason = validateString(sanitized.reason, 'reason', { min: 1, max: 300, required: true });
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || c.req.header('idempotency-key') || c.req.header('x-idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    if (sanitized.amount === undefined) return c.json({ success: false, error: 'CREDIT_AMOUNT_REQUIRED' }, 400);
    const paymentAmountEgp = validateNumber(sanitized.paymentAmountEgp, 'paymentAmountEgp', { min: 50, max: 2_000, integerOnly: true });
    const callerUid = user.uid;
    const requestFingerprint = createRequestFingerprint({ garageId, amount: sanitized.amount, paymentAmountEgp, reason });
    let granted: any = null;
    await getAdminDb().runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/garages/:id/credit-grants', callerUid, requestFingerprint);
      if (isDuplicate) { granted = cachedResult; return; }
      const garageRef = getAdminDb().doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garage = garageSnap.data() || {};
      if (garage.billingModel !== 'prepaid_credits') throw new Error('GARAGE_NOT_PREPAID');
      const isFirstPaidGrant = !garage.firstPaidCreditGrantAt;
      const isFirstQualifyingGrant = !garage.firstQualifyingGrantAt && paymentAmountEgp >= 500;
      // Delegate commission is now a rolling 30-day recurring rule, NOT one-time.
      // It fires when paymentAmountEgp >= 500 AND (no prior commission OR the last
      // commission was more than 30 days ago). Capped at 100 EGP per 30-day window
      // per garage. The referral reward (20 credits to the referrer) stays one-time
      // — it still only fires on isFirstQualifyingGrant.
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const isQualifyingPayment = paymentAmountEgp >= 500;
      const lastCommissionGrantAt = garage.lastCommissionGrantAt
        ? (garage.lastCommissionGrantAt.toMillis ? garage.lastCommissionGrantAt.toMillis() : new Date(garage.lastCommissionGrantAt).getTime())
        : null;
      const isCommissionDue = isQualifyingPayment && (lastCommissionGrantAt === null || (Date.now() - lastCommissionGrantAt) >= THIRTY_DAYS_MS);
      const commissionDelegateId = isCommissionDue && typeof garage.createdByDelegateId === 'string'
        ? garage.createdByDelegateId.trim()
        : '';
      const commissionDelegateRef = commissionDelegateId
        ? getAdminDb().collection('delegates').doc(commissionDelegateId)
        : null;
      const commissionDelegateSnap = commissionDelegateRef ? await t.get(commissionDelegateRef) : null;
      if (commissionDelegateRef && !commissionDelegateSnap?.exists) throw new Error('DELEGATE_NOT_FOUND');
      const commissionDelegateData = commissionDelegateSnap?.data() || {};
      const currentLifetimeCommission = commissionDelegateRef
        ? parseMoneyAmount(commissionDelegateData.totalCommissionEarned ?? 0)
        : null;
      const currentUnsettledCommission = commissionDelegateRef
        ? parseMoneyAmount(commissionDelegateData.totalRechargedAmount ?? 0)
        : null;
      if (commissionDelegateRef && (currentLifetimeCommission === null || currentUnsettledCommission === null)) {
        throw new Error('INVALID_DELEGATE_COMMISSION_BALANCE');
      }
      const nextLifetimeCommission = commissionDelegateRef
        ? parseMoneyAmount(currentLifetimeCommission! + 100)
        : null;
      const nextUnsettledCommission = commissionDelegateRef
        ? parseMoneyAmount(currentUnsettledCommission! + 100)
        : null;
      if (commissionDelegateRef && (nextLifetimeCommission === null || nextUnsettledCommission === null)) {
        throw new Error('INVALID_DELEGATE_COMMISSION_BALANCE');
      }
      const referrerGarageId = typeof garage.referredByGarageId === 'string' ? garage.referredByGarageId : '';
      const referralMarkerRef = isFirstQualifyingGrant ? getAdminDb().doc(`credit_referral_awards/${garageId}`) : null;
      const referralMarkerSnap = referralMarkerRef ? await t.get(referralMarkerRef) : null;
      const referrerRef = isFirstQualifyingGrant && referralMarkerRef && !referralMarkerSnap?.exists && referrerGarageId && referrerGarageId !== garageId ? getAdminDb().doc(`garages/${referrerGarageId}`) : null;
      const referrerSnap = referrerRef ? await t.get(referrerRef) : null;
      let amount: number;
      // ── Credit rate ────────────────────────────────────────────────────────
      // 1 EGP = N credits where N = creditRate (default 1).
      // The client-sent `amount` field is ignored — the server is authoritative
      // for the EGP→credit conversion so the admin UI doesn't need to know the
      // rate. The client only sends paymentAmountEgp; credits are derived.
      const configSnap = await t.get(getAdminDb().doc('system_config/global'));
      const configData = configSnap.exists ? (configSnap.data() || {}) : {};
      const creditRate = Number(configData.creditRate ?? 1);
      if (!Number.isFinite(creditRate) || creditRate <= 0) {
        throw new Error('INVALID_CREDIT_RATE_CONFIG');
      }
      amount = Math.round(paymentAmountEgp * creditRate);
      if (!Number.isSafeInteger(amount) || amount < 1) {
        // EGP × rate rounded to less than 1 credit — rate is too low for this amount.
        throw new Error('CREDIT_AMOUNT_BELOW_MINIMUM');
      }
      const currentBalance = Number(garage.credits ?? 0);
      const transition = grantPaidCredits({ balance: currentBalance, amount, garageId, actorUid: callerUid, actorRole: 'admin', reason, occurredAt: new Date().toISOString(), idempotencyKey });
      if (transition.ok === false) throw new Error(transition.error);
      const entry = materializeCreditLedgerEntry(transition.value.entry);
      if (entry.ok === false) throw new Error(entry.error);
      let referralAward: any = null;
      let referralLedger: any = null;
      let referralTransition: any = null;
      if (isFirstQualifyingGrant && referrerRef && referrerSnap?.exists && referrerSnap.data()?.billingModel === 'prepaid_credits' && referralMarkerRef && !referralMarkerSnap?.exists) {
        const referrer = referrerSnap.data() || {};
        const rewardIdempotencyKey = `first_paid_grant:${garageId}`;
        referralTransition = awardReferralCredits({
          balance: Number(referrer.credits ?? 0),
          garageId: referrerGarageId,
          actorUid: callerUid,
          actorRole: 'admin',
          reason: 'First confirmed paid grant referral reward',
          occurredAt: transition.value.entry.occurredAt,
          idempotencyKey: rewardIdempotencyKey,
          referrerGarageId,
          referredGarageId: garageId,
          paidGrantConfirmed: true,
          firstPaidGrant: true,
        });
        if (referralTransition.ok === false) throw new Error(referralTransition.error);
        const materializedReward = materializeCreditLedgerEntry(referralTransition.value.entry);
        if (materializedReward.ok === false) throw new Error(materializedReward.error);
        referralLedger = materializedReward.value;
        referralAward = { garageId: referrerGarageId, amount: 20, entryId: referralLedger.entryId };
      }
      const now = new Date();
      const currentAdminRevenue = Number(garage.totalAdminRevenue || 0);
      const newAdminRevenue = currentAdminRevenue + paymentAmountEgp;
      t.set(garageRef, {
        credits: transition.value.balance,
        totalAdminRevenue: newAdminRevenue,
        ...(isFirstPaidGrant ? { firstPaidCreditGrantAt: now } : {}),
        ...(isFirstQualifyingGrant ? { firstQualifyingGrantAt: now } : {}),
        // Update lastCommissionGrantAt so the rolling 30-day window resets.
        // Only set when commission was actually due this grant.
        ...(isCommissionDue ? { lastCommissionGrantAt: now } : {})
      }, { merge: true });
      t.set(getAdminDb().doc(`credit_ledger/${entry.value.entryId}`), { ...entry.value, source: 'admin_entered_grant', paymentConfirmed: true, paymentAmountEgp });
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId,
        aggregateType: 'credit_grant',
        aggregateId: entry.value.entryId,
        eventType: 'prepaid_credit_grant_paid',
        actorUid: callerUid,
        actorRole: 'admin',
        idempotencyKey,
        payload: { amount: paymentAmountEgp, creditAmount: amount, creditLedgerEntryId: entry.value.entryId }
      });
      if (commissionDelegateRef && commissionDelegateId) {
        t.update(commissionDelegateRef, {
          totalCommissionEarned: nextLifetimeCommission,
          totalRechargedAmount: nextUnsettledCommission,
          updatedAt: now
        });
        recordDomainEventInTransaction(t, getAdminDb(), {
          garageId,
          aggregateType: 'delegate',
          aggregateId: commissionDelegateId,
          eventType: 'commission_earned',
          actorUid: callerUid,
          actorRole: 'admin',
          // Unique per 30-day window so recurring commissions don't collide
          // with the first one. Uses the credit-grant's idempotency key as
          // the base so retries of the same grant don't double-count.
          idempotencyKey: `${idempotencyKey}:commission`,
          payload: {
            delegateId: commissionDelegateId,
            commissionAmount: 100,
            sourceCreditGrantId: entry.value.entryId,
            earnedAt: now.toISOString()
          }
        });
      }
      t.set(getAdminDb().collection('activity_logs').doc(), { garageId, garageName: garage.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_grant', timestamp: new Date(), details: { amount, paymentAmountEgp, reason, ledgerEntryId: entry.value.entryId } });
      if (referralLedger && referralAward && referrerRef && referralMarkerRef) {
        t.set(referrerRef, { credits: referralTransition.value.balance }, { merge: true });
        t.set(getAdminDb().doc(`credit_ledger/${referralLedger.entryId}`), { ...referralLedger, source: 'first_paid_grant_referral', referredGarageId: garageId });
        t.set(getAdminDb().collection('activity_logs').doc(), { garageId: referrerGarageId, garageName: referrerSnap.data()?.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_referral_award', timestamp: new Date(), details: { referredGarageId: garageId, amount: 20, ledgerEntryId: referralLedger.entryId } });
      }
      if (isFirstQualifyingGrant && referralMarkerRef && !referralMarkerSnap?.exists) {
        t.set(referralMarkerRef, {
          referredGarageId: garageId,
          referrerGarageId: referrerGarageId || null,
          ledgerEntryId: referralLedger?.entryId || null,
          amount: referralLedger ? 20 : 0,
          status: referralLedger ? 'awarded' : (referrerGarageId ? 'referrer_not_prepaid' : 'no_eligible_referrer'),
          createdAt: now,
          createdBy: callerUid,
        });
      }
      granted = { garageId, amount, paymentAmountEgp, balance: transition.value.balance, entryId: entry.value.entryId, referralAward };
      storeIdempotencyInTransaction(t, idempotencyKey, granted, '/api/garages/:id/credit-grants', callerUid, requestFingerprint);
      // Atomically increment the admin-summary counter inside the transaction
      // so the next admin-dashboard read is O(1) instead of a full collection scan.
      writeMaintainedAdminDelta(t, { totalAdminRevenue: paymentAmountEgp });
    });
    return c.json({ success: true, data: granted });
  } catch (error: any) {
    if (error?.message === 'DELEGATE_NOT_FOUND' || error?.message === 'INVALID_DELEGATE_COMMISSION_BALANCE') {
      return c.json({ success: false, error: error.message }, 409);
    }
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Admin credit correction: adds or removes credits from a garage outside the
// normal 50-2,000 EGP grant flow, for fixing mistakes. Positive amount adds,
// negative amount removes (cannot drive balance below zero). A typed reason is
// required and recorded in the ledger as kind='correction_delta'.
app.post('/api/garages/:id/credit-corrections', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'ADMIN_ONLY' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['amount', 'reason', 'idempotencyKey'], false);
    const reason = validateString(sanitized.reason, 'reason', { min: 1, max: 300, required: true });
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || c.req.header('idempotency-key') || c.req.header('x-idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    if (sanitized.amount === undefined) return c.json({ success: false, error: 'CREDIT_AMOUNT_REQUIRED' }, 400);
    // Allow any non-zero integer amount, positive or negative, within a sane bound.
    const amount = validateNumber(sanitized.amount, 'amount', { min: -100_000, max: 100_000, integerOnly: true });
    if (amount === 0) return c.json({ success: false, error: 'INVALID_CREDIT_AMOUNT' }, 400);
    const callerUid = user.uid;
    const requestFingerprint = createRequestFingerprint({ garageId, amount, reason, kind: 'correction' });
    let correction: any = null;
    await getAdminDb().runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/garages/:id/credit-corrections', callerUid, requestFingerprint);
      if (isDuplicate) { correction = cachedResult; return; }
      const garageRef = getAdminDb().doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garage = garageSnap.data() || {};
      if (garage.billingModel !== 'prepaid_credits') throw new Error('GARAGE_NOT_PREPAID');
      const currentBalance = Number(garage.credits ?? 0);
      const transition = applyCorrection({ balance: currentBalance, amount, garageId, actorUid: callerUid, actorRole: 'admin', reason, occurredAt: new Date().toISOString(), idempotencyKey });
      if (transition.ok === false) throw new Error(transition.error);
      const entry = materializeCreditLedgerEntry(transition.value.entry);
      if (entry.ok === false) throw new Error(entry.error);
      t.set(garageRef, { credits: transition.value.balance }, { merge: true });
      t.set(getAdminDb().doc(`credit_ledger/${entry.value.entryId}`), { ...entry.value, source: 'admin_correction' });
      t.set(getAdminDb().collection('activity_logs').doc(), { garageId, garageName: garage.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_correction', timestamp: new Date(), details: { amount, reason, ledgerEntryId: entry.value.entryId } });
      correction = { garageId, amount, reason, balance: transition.value.balance, entryId: entry.value.entryId };
      storeIdempotencyInTransaction(t, idempotencyKey, correction, '/api/garages/:id/credit-corrections', callerUid, requestFingerprint);
    });
    return c.json({ success: true, data: correction });
  } catch (error: any) {
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Admin and the garage owner can inspect the same scoped, read-only credit history.
app.get('/api/garages/:id/credit-ledger', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const scopedGarage = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);
    if (user?.role !== 'admin' && !scopedGarage) return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    const pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), `credit-ledger:${garageId}`);
    const collection = getAdminDb().collection('credit_ledger');
    let query = collection.where('garageId', '==', garageId).orderBy('occurredAt', 'desc').orderBy('__name__', 'desc');
    query = firestorePageStartAfter(query, collection, pageRequest.cursor);
    const snapshot = await query.limit(pageRequest.pageSize + 1).get();
    const page = buildFirestorePage(snapshot.docs, pageRequest, 'occurredAt');
    const entries = page.documents.map((doc: any) => {
      const row = doc.data() || {};
      const common = { id: doc.id, entryId: row.entryId, garageId: row.garageId, kind: row.kind, amount: row.amount, balanceBefore: row.balanceBefore, balanceAfter: row.balanceAfter, occurredAt: row.occurredAt };
      return user?.role === 'admin' ? { ...common, paymentAmountEgp: row.paymentAmountEgp, actorUid: row.actorUid, actorRole: row.actorRole, reason: row.reason, idempotencyKey: row.idempotencyKey, source: row.source } : common;
    });
    return c.json({ success: true, data: entries, hasMore: page.hasMore, nextCursor: page.nextCursor });
  } catch (error: any) {
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Garage Maintenance: Recalculate Cars Inside
app.post('/api/garages/recalculate-cars-inside', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId } = body;
    if (!garageId || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    if (!canRunGarageMaintenance(user, 'recalculate-cars-inside')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const vehSnap = await getAdminDb().collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get();
    const actualCount = vehSnap.size;

    await getAdminDb().collection('garages').doc(garageId).update({ carsInside: actualCount });
    return c.json({ success: true, count: actualCount });
  } catch (e: any) {
    console.error('[Worker Garage] Error in recalculate-cars-inside:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

}
