import type { WorkerApp, WorkerUser } from './cloudflareWorker';
import { adminDb } from './firebaseAdmin';
import { requireWorkerAuth } from './sessionInfrastructure';
import { validateId, validateNumber } from './validation';
import { grantPaidCredits, materializeCreditLedgerEntry, awardReferralCredits } from './domain/prepaidCreditLedger';
import { recordDomainEventInTransaction } from './events';
import { decideDelegateCommission, COMMISSION_AMOUNT_EGP } from './domain/delegateCommission';
import { CREDIT_AMOUNT_MAX_EGP, CREDIT_AMOUNT_MIN_EGP } from './domain/limits';
import { parseMoneyAmount, addMoneyRounded } from './money';
import { withAdmin, withErrorHandler } from './routes/combinators';
import { writeMaintainedAdminDelta } from './workerMaintenance';
import { buildActivityLogEntry } from './activityLogWriter';


/**
 * Credit-request routes for the delegate → admin credit request flow.
 *
 * A delegate who created a garage can request credits for it. The request
 * goes to the admin for review. On approval, the credits are granted to the
 * garage and the delegate commission (rolling 30-day rule) fires if the
 * amount is >= 500 EGP.
 *
 * Collection: credit_requests/{id}
 * Fields: garageId, delegateId, delegateName, garageName, amount, status
 *         ('pending' | 'approved' | 'rejected'), createdAt, reviewedAt,
 *         reviewedBy
 */
export function registerCreditRequestRoutes(app: WorkerApp): void {

  // ── Delegate creates a credit request ────────────────────────────────
  app.post('/api/delegates/credit-requests', requireWorkerAuth, withErrorHandler(async (c: any) => {
    const user = c.get('user') as WorkerUser | undefined;
    if (user?.role !== 'delegate') {
      return c.json({ success: false, error: 'FORBIDDEN: Delegate role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const { garageId, amount: rawAmount } = body || {};
    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }
    const validatedGarageId = validateId(garageId, 'garageId', true);
    const amount = validateNumber(rawAmount, 'amount', { min: CREDIT_AMOUNT_MIN_EGP, max: CREDIT_AMOUNT_MAX_EGP, integerOnly: true });

    const delegateId = user.entityId || user.uid;

    // Verify the garage exists and was created by this delegate.
    const garageSnap = await adminDb.doc(`garages/${validatedGarageId}`).get();
    if (!garageSnap.exists) {
      return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
    }
    const garage = garageSnap.data() || {};
    if (garage.createdByDelegateId !== delegateId) {
      return c.json({ success: false, error: 'FORBIDDEN: You can only request credits for garages you created' }, 403);
    }
    if (garage.billingModel !== 'prepaid_credits') {
      return c.json({ success: false, error: 'GARAGE_NOT_PREPAID' }, 400);
    }

    // One pending request per garage at a time.
    // Fast pre-check — covers legacy requests created before the transactional
    // lock below existed. The AUTHORITATIVE check is the lock document inside
    // the transaction: without it, two concurrent creates both saw "no pending
    // request" and both committed, and the admin could approve both — a double
    // credit grant (audit 2026-11-21).
    const existingSnap = await adminDb
      .collection('credit_requests')
      .where('garageId', '==', validatedGarageId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      return c.json({ success: false, error: 'PENDING_REQUEST_EXISTS' }, 409);
    }

    const now = new Date();
    const requestRef = adminDb.collection('credit_requests').doc();
    // Lock document, one per garage. Created and released inside transactions
    // so concurrent creates collide on the commit (409 → retry → lock seen).
    const lockRef = adminDb.doc(`credit_request_locks/${validatedGarageId}`);
    let lockAcquired = true;
    await adminDb.runTransaction(async (t: any) => {
      const lockSnap = await t.get(lockRef);
      if (lockSnap.exists) {
        lockAcquired = false;
        return;
      }
      t.set(lockRef, {
        garageId: validatedGarageId,
        requestId: requestRef.id,
        createdAt: now
      });
      t.set(requestRef, {
        garageId: validatedGarageId,
        garageName: garage.name || '',
        delegateId,
        delegateName: user.displayName || '',
        amount,
        status: 'pending',
        createdAt: now,
      });
    });
    if (!lockAcquired) {
      return c.json({ success: false, error: 'PENDING_REQUEST_EXISTS' }, 409);
    }

    return c.json({ success: true, id: requestRef.id });
  }, 'CreditRequest'));

  // ── Delegate lists their own credit requests ─────────────────────────
  app.get('/api/delegates/credit-requests', requireWorkerAuth, withErrorHandler(async (c: any) => {
    const user = c.get('user') as WorkerUser | undefined;
    if (user?.role !== 'delegate') {
      return c.json({ success: false, error: 'FORBIDDEN: Delegate role required' }, 403);
    }
    const delegateId = user.entityId || user.uid;
    // Return recent requests (pending + recently reviewed). The delegate UI
    // uses this to show pending/rejected badges on their garage cards.
    const snap = await adminDb
      .collection('credit_requests')
      .where('delegateId', '==', delegateId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const requests = snap.docs.map((doc: any) => {
      const data = doc.data();
      // Normalize timestamp for JSON transport
      const createdAt = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt instanceof Date ? data.createdAt.getTime() : Date.now());
      const reviewedAt = data.reviewedAt?.toMillis ? data.reviewedAt.toMillis() : (data.reviewedAt instanceof Date ? data.reviewedAt.getTime() : null);
      return {
        id: doc.id,
        garageId: data.garageId,
        garageName: data.garageName || '',
        delegateId: data.delegateId,
        delegateName: data.delegateName || '',
        amount: Number(data.amount || 0),
        status: data.status || 'pending',
        createdAt,
        reviewedAt,
      };
    });

    return c.json({ success: true, requests });
  }, 'CreditRequest'));

  // ── Admin lists pending credit requests ──────────────────────────────
  app.get('/api/admin/credit-requests', requireWorkerAuth, withErrorHandler(withAdmin(async (c: any) => {
    const status = c.req.query('status') || 'pending';
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return c.json({ success: false, error: 'INVALID_STATUS' }, 400);
    }

    const limitParam = parseInt(c.req.query('limit') || '50', 10);
    const pageSize = Number.isSafeInteger(limitParam) && limitParam > 0 && limitParam <= 100 ? limitParam : 50;

    const snap = await adminDb
      .collection('credit_requests')
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(pageSize)
      .get();

    const requests = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    // Attach a per-request credits preview (per-garage pricing, owner decision
    // 2026-11-18): the admin approves "X ج.م collected by the delegate", and
    // the credits the garage will actually receive depend on THAT garage's
    // price. Showing the conversion BEFORE the click prevents approvals made
    // on a wrong 1:1 assumption. Cost is bounded: one system_config read plus
    // one getAll for the distinct garage ids on this page (≤ pageSize, and
    // only one pending request can exist per garage).
    const previewGarageIds: string[] = [...new Set<string>(
      requests.map((r: any) => String(r.garageId || '')).filter(Boolean)
    )];
    if (previewGarageIds.length) {
      const rateConfigSnap = await adminDb.doc('system_config/global').get();
      const globalRateRaw = rateConfigSnap.exists ? Number((rateConfigSnap.data() || {}).creditRate) : NaN;
      const garageSnaps = await adminDb.getAll(
        ...previewGarageIds.map((id: string) => adminDb.doc(`garages/${id}`))
      );
      const overrideByGarageId = new Map<string, number>();
      garageSnaps.forEach((gs: any, i: number) => {
        if (!gs?.exists) return;
        const overrideRaw = Number((gs.data() || {}).creditRateOverride);
        if (Number.isFinite(overrideRaw) && overrideRaw > 0) overrideByGarageId.set(previewGarageIds[i], overrideRaw);
      });
      for (const r of requests as any[]) {
        const egp = Number(r.amount);
        const rateRaw = overrideByGarageId.get(String(r.garageId));
        const rate = (Number.isFinite(rateRaw) && rateRaw > 0)
          ? rateRaw
          : (Number.isFinite(globalRateRaw) && globalRateRaw > 0 ? globalRateRaw : 1);
        if (Number.isSafeInteger(egp) && egp > 0) {
          const credits = Math.round(egp * rate);
          if (Number.isSafeInteger(credits) && credits > 0) r.creditsPreview = credits;
        }
      }
    }

    return c.json({ success: true, requests });
  }), 'CreditRequest'));

  // ── Admin approves a credit request ──────────────────────────────────
  app.post('/api/admin/credit-requests/:id/approve', requireWorkerAuth, withErrorHandler(withAdmin(async (c: any) => {
    const user = c.get('user') as WorkerUser | undefined;
    const requestId = validateId(c.req.param('id'), 'id', true);
    const callerUid = user.uid;
    const now = new Date();

    let grantedResult: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const requestRef = adminDb.doc(`credit_requests/${requestId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) throw new Error('CREDIT_REQUEST_NOT_FOUND');
      const requestData = requestSnap.data() || {};
      if (requestData.status !== 'pending') throw new Error('CREDIT_REQUEST_ALREADY_PROCESSED');

      const garageRef = adminDb.doc(`garages/${requestData.garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garage = garageSnap.data() || {};
      if (garage.billingModel !== 'prepaid_credits') throw new Error('GARAGE_NOT_PREPAID');

      const paymentAmountEgp = Number(requestData.amount);
      if (!Number.isSafeInteger(paymentAmountEgp) || paymentAmountEgp <= 0) {
        throw new Error('INVALID_CREDIT_AMOUNT');
      }
      const currentBalance = Number(garage.credits ?? 0);

      // ── Credit rate (per-garage pricing, owner decision 2026-11-18) ──────
      // The request `amount` is the EGP the delegate collected from the
      // garage — NOT the credit count. Approval converts it with THIS
      // garage's price using the exact same selection + rounding as
      // /api/garages/:id/credit-grants: the garage's creditRateOverride wins,
      // the global system_config rate is the fallback. The old 1:1 behavior
      // silently ignored pinned prices and recorded revenue that
      // contradicted them.
      const rateConfigSnap = await t.get(adminDb.doc('system_config/global'));
      const rateConfigData = rateConfigSnap.exists ? (rateConfigSnap.data() || {}) : {};
      const creditRate = Number(garage.creditRateOverride ?? rateConfigData.creditRate ?? 1);
      if (!Number.isFinite(creditRate) || creditRate <= 0) {
        throw new Error('INVALID_CREDIT_RATE_CONFIG');
      }
      const amount = Math.round(paymentAmountEgp * creditRate);
      if (!Number.isSafeInteger(amount) || amount < 1) {
        throw new Error('CREDIT_AMOUNT_BELOW_MINIMUM');
      }

      // Grant the credits (same pattern as /api/garages/:id/credit-grants).
      const transition = grantPaidCredits({
        balance: currentBalance,
        amount,
        garageId: requestData.garageId,
        actorUid: callerUid,
        actorRole: 'admin',
        reason: `Credit request approved (${paymentAmountEgp} EGP for ${garage.name || requestData.garageId})`,
        occurredAt: now.toISOString(),
        idempotencyKey: `credit-request-approve:${requestId}`,
      });
      if (transition.ok === false) throw new Error(transition.error);
      const entry = materializeCreditLedgerEntry(transition.value.entry);
      if (entry.ok === false) throw new Error(entry.error);

      // ── Delegate commission (rolling 30-day rule) ───────────────────
      // Trigger is the EGP collected (≥ 500), NOT the derived credit count.
      // Shared with creditGrantRoutes.
      const { isCommissionDue, commissionDelegateId } = decideDelegateCommission(
        paymentAmountEgp, garage.createdByDelegateId, garage.lastCommissionGrantAt
      );

      let nextLifetimeCommission: number | null = null;
      let nextUnsettledCommission: number | null = null;
      let commissionDelegateRef: any = null;

      if (commissionDelegateId) {
        commissionDelegateRef = adminDb.collection('delegates').doc(commissionDelegateId);
        const delegateSnap = await t.get(commissionDelegateRef);
        if (!delegateSnap.exists) throw new Error('DELEGATE_NOT_FOUND');
        const delegateData = delegateSnap.data() || {};
        const currentLifetime = parseMoneyAmount(delegateData.totalCommissionEarned ?? 0);
        const currentUnsettled = parseMoneyAmount(delegateData.totalRechargedAmount ?? 0);
        nextLifetimeCommission = parseMoneyAmount(currentLifetime + COMMISSION_AMOUNT_EGP);
        nextUnsettledCommission = parseMoneyAmount(currentUnsettled + COMMISSION_AMOUNT_EGP);
      }

      // ── Referral reward (same trigger as /api/garages/:id/credit-grants) ──
      // The referral reward and the delegate commission fire on the SAME
      // trigger (first qualifying paid grant ≥ 500 EGP — owner contract,
      // docs/PROJECT.md). The approval path previously skipped the reward
      // entirely, so whether a garage's referrer got paid depended on which
      // screen the admin used for the payment. This mirrors the direct-grant
      // path in creditGrantRoutes.ts exactly, including the marker doc that
      // makes the one-time award idempotent.
      const isFirstPaidGrant = !garage.firstPaidCreditGrantAt;
      const isFirstQualifyingGrant = !garage.firstQualifyingGrantAt && paymentAmountEgp >= 500;
      const referrerGarageId = typeof garage.referredByGarageId === 'string' ? garage.referredByGarageId : '';
      const referralMarkerRef = isFirstQualifyingGrant ? adminDb.doc(`credit_referral_awards/${requestData.garageId}`) : null;
      const referralMarkerSnap = referralMarkerRef ? await t.get(referralMarkerRef) : null;
      const referrerRef = isFirstQualifyingGrant && referralMarkerRef && !referralMarkerSnap?.exists && referrerGarageId && referrerGarageId !== requestData.garageId ? adminDb.doc(`garages/${referrerGarageId}`) : null;
      const referrerSnap = referrerRef ? await t.get(referrerRef) : null;
      let referralAward: any = null;
      let referralLedger: any = null;
      let referralTransition: any = null;
      if (isFirstQualifyingGrant && referrerRef && referrerSnap?.exists && referrerSnap.data()?.billingModel === 'prepaid_credits' && referralMarkerRef && !referralMarkerSnap?.exists) {
        const referrer = referrerSnap.data() || {};
        referralTransition = awardReferralCredits({
          balance: Number(referrer.credits ?? 0),
          garageId: referrerGarageId,
          actorUid: callerUid,
          actorRole: 'admin',
          reason: 'First confirmed paid grant referral reward',
          occurredAt: transition.value.entry.occurredAt,
          idempotencyKey: `first_paid_grant:${requestData.garageId}`,
          referrerGarageId,
          referredGarageId: requestData.garageId,
          paidGrantConfirmed: true,
          firstPaidGrant: true,
        });
        if (referralTransition.ok === false) throw new Error(referralTransition.error);
        const materializedReward = materializeCreditLedgerEntry(referralTransition.value.entry);
        if (materializedReward.ok === false) throw new Error(materializedReward.error);
        referralLedger = materializedReward.value;
        referralAward = { garageId: referrerGarageId, amount: 10, entryId: referralLedger.entryId };
      }

      // ── Write everything ─────────────────────────────────────
      // Audit fix (2026-11-21): approval revenue now feeds the O(1) admin
      // summary exactly like the direct-grant path (writeMaintainedAdminDelta
      // below) — previously the two grant paths diverged and the admin
      // summary undercounted every request-approved payment.
      // Audit fix (2026-11-21): cent-rounded accumulation — the identical
      // counter on the direct-grant path (creditGrantRoutes.ts) rounds the
      // same way; raw float adds drift by fractions over years.
      const newAdminRevenue = addMoneyRounded(garage.totalAdminRevenue, paymentAmountEgp);
      t.set(garageRef, {
        credits: transition.value.balance,
        totalAdminRevenue: newAdminRevenue,
        // Stamp the badge trigger on the garage doc (mirrors
        // /api/garages/:id/credit-grants) so the client's notification
        // listener doesn't need a separate activity_logs subscription.
        lastCreditGrantAt: now,
        // Mirror the direct-grant path's first-grant stamps — the referral
        // reward and first-paid-grant semantics depend on them, so the two
        // payment paths must record the same history.
        ...(isFirstPaidGrant ? { firstPaidCreditGrantAt: now } : {}),
        ...(isFirstQualifyingGrant ? { firstQualifyingGrantAt: now } : {}),
        ...(isCommissionDue ? { lastCommissionGrantAt: now } : {})
      }, { merge: true });

      t.set(adminDb.doc(`credit_ledger/${entry.value.entryId}`), {
        ...entry.value,
        source: 'credit_request_approval',
        paymentConfirmed: true,
        paymentAmountEgp,
        // Name stamp for the admin Income page (owner feature 2026-11-23):
        // each income row carries its garage's name so the history screen
        // never needs per-row garage lookups for new entries.
        garageName: garage.name || requestData.garageName || ''
      });

      if (commissionDelegateRef && commissionDelegateId) {
        t.update(commissionDelegateRef, {
          totalCommissionEarned: nextLifetimeCommission,
          totalRechargedAmount: nextUnsettledCommission,
          updatedAt: now
        });
        recordDomainEventInTransaction(t, adminDb, {
          garageId: requestData.garageId,
          aggregateType: 'delegate',
          aggregateId: commissionDelegateId,
          eventType: 'commission_earned',
          actorUid: callerUid,
          actorRole: 'admin',
          idempotencyKey: `credit-request-approve:${requestId}:commission`,
          payload: {
            delegateId: commissionDelegateId,
            commissionAmount: COMMISSION_AMOUNT_EGP,
            sourceCreditGrantId: entry.value.entryId,
            earnedAt: now.toISOString()
          }
        });
      }

      // Mark the request as approved.
      t.update(requestRef, {
        status: 'approved',
        reviewedAt: now,
        reviewedBy: callerUid
      });

      // Release the one-pending-request lock so the garage can request again
      // (audit 2026-11-21). Deleting a missing legacy lock is a no-op.
      t.delete(adminDb.doc(`credit_request_locks/${requestData.garageId}`));

      // O(1) admin-summary delta — must mirror the direct-grant path
      // (creditGrantRoutes.ts) or the summary undercounts (audit 2026-11-21).
      writeMaintainedAdminDelta(t, { totalAdminRevenue: paymentAmountEgp });

      // Write an activity_log entry so the garage-side recharge
      // notification (subscribeToGarageRechargeLogs) picks this up.
      // Mirrors the direct-grant path in /api/garages/:id/credit-grants.
      t.set(adminDb.collection('activity_logs').doc(), buildActivityLogEntry({
        garageId: requestData.garageId,
        garageName: garage.name || requestData.garageName || '',
        staffId: callerUid,
        staffName: user.displayName || 'Admin',
        actionType: 'credit_grant',
        timestamp: now,
        details: {
          amount,
          paymentAmountEgp,
          reason: `Credit request approved (${paymentAmountEgp} EGP for ${garage.name || requestData.garageId})`,
          ledgerEntryId: entry.value.entryId,
          source: 'credit_request_approval'
        }
      }));

      // Referral writes — same shape as the direct-grant path
      // (creditGrantRoutes.ts): referrer balance, referral ledger entry,
      // referrer activity log, and the one-time marker (which also records
      // why no reward was paid when there is no eligible referrer).
      if (referralLedger && referralAward && referrerRef && referralMarkerRef) {
        t.set(referrerRef, { credits: referralTransition.value.balance }, { merge: true });
        t.set(adminDb.doc(`credit_ledger/${referralLedger.entryId}`), { ...referralLedger, source: 'first_paid_grant_referral', referredGarageId: requestData.garageId });
        t.set(adminDb.collection('activity_logs').doc(), buildActivityLogEntry({ garageId: referrerGarageId, garageName: referrerSnap.data()?.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_referral_award', timestamp: now, details: { referredGarageId: requestData.garageId, amount: 10, ledgerEntryId: referralLedger.entryId } }));
      }
      if (isFirstQualifyingGrant && referralMarkerRef && !referralMarkerSnap?.exists) {
        t.set(referralMarkerRef, {
          referredGarageId: requestData.garageId,
          referrerGarageId: referrerGarageId || null,
          ledgerEntryId: referralLedger?.entryId || null,
          amount: referralLedger ? 10 : 0,
          status: referralLedger ? 'awarded' : (referrerGarageId ? 'referrer_not_prepaid' : 'no_eligible_referrer'),
          createdAt: now,
          createdBy: callerUid,
        });
      }

      recordDomainEventInTransaction(t, adminDb, {
        garageId: requestData.garageId,
        aggregateType: 'credit_request',
        aggregateId: requestId,
        eventType: 'credit_request_approved',
        actorUid: callerUid,
        actorRole: 'admin',
        idempotencyKey: `credit-request-approve:${requestId}`,
        payload: { amount, paymentAmountEgp, delegateId: requestData.delegateId }
      });

      grantedResult = {
        credits: transition.value.balance,
        creditsGranted: amount,
        paymentAmountEgp,
        commissionGranted: isCommissionDue,
        commissionAmount: isCommissionDue ? COMMISSION_AMOUNT_EGP : 0,
        referralAward
      };
    });

    return c.json({ success: true, ...grantedResult });
  }), 'CreditRequest'));

  // ── Admin rejects a credit request ───────────────────────────────────
  app.post('/api/admin/credit-requests/:id/reject', requireWorkerAuth, withErrorHandler(withAdmin(async (c: any) => {
    const user = c.get('user') as WorkerUser | undefined;
    const requestId = validateId(c.req.param('id'), 'id', true);
    const callerUid = user.uid;
    const now = new Date();

    const requestRef = adminDb.doc(`credit_requests/${requestId}`);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      return c.json({ success: false, error: 'CREDIT_REQUEST_NOT_FOUND' }, 404);
    }
    const requestData = requestSnap.data() || {};
    if (requestData.status !== 'pending') {
      return c.json({ success: false, error: 'CREDIT_REQUEST_ALREADY_PROCESSED' }, 409);
    }

    // Transactional so the status flip and the lock release commit together
    // (audit 2026-11-21): a crash between them would leave a stale lock that
    // blocks the garage from ever requesting credits again.
    await adminDb.runTransaction(async (t: any) => {
      const freshSnap = await t.get(requestRef);
      if (!freshSnap.exists) throw new Error('CREDIT_REQUEST_NOT_FOUND');
      const freshData = freshSnap.data() || {};
      if (freshData.status !== 'pending') throw new Error('CREDIT_REQUEST_ALREADY_PROCESSED');
      t.update(requestRef, {
        status: 'rejected',
        reviewedAt: now,
        reviewedBy: callerUid
      });
      t.delete(adminDb.doc(`credit_request_locks/${String(freshData.garageId || requestData.garageId || '')}`));
    });

    return c.json({ success: true });
  }), 'CreditRequest'));
}
