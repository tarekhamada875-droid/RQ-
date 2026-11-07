import type { WorkerApp } from './cloudflareWorker';
import { enforceWorkerFinancialRateLimit } from './cloudflareWorker';
import { adminDb } from './firebaseAdmin';
import { withErrorHandler } from './routes/combinators';
import { requireWorkerAuth } from './sessionInfrastructure';
import { canSubmitGarageApplication, canManageGarageScopedData as decideGarageScope, canRunGarageMaintenance } from './domain/authorization';
import { grantTrialCredits, materializeCreditLedgerEntry } from './domain/prepaidCreditLedger';
import { aggregateProjectionBuckets, isFreshDashboardSummary, isValidDateKey, normalizeStoredDashboardMoney, reconcileDashboardSummary } from './dashboardSummary';
import { calculateDailyProjection, getCairoDayBounds } from './projections';
import { buildFirestorePage, firestorePageStartAfter, parseFirestorePageRequest } from './firestorePagination';
import { mapDomainErrorToStatus } from './routes/helpers';
import {
  MAINTAINED_SUMMARY_VERSION,
  maintainedGarageSummaryRef,
  maintainedAdminSummaryRef,
  writeMaintainedAdminDelta,
} from './workerMaintenance';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from './idempotency';
import { parseMoneyAmount } from './money';
import { computeLookupHash } from './pinCrypto';
import { checkPinAvailabilityAcrossAll, saveEntityPinInTransaction } from './pinRepository';
import { reconcileGarageState } from './domain/garageReconciliation';
import { validateId, validateIdempotencyKey, validateNewPin, validateNumber, validateString, sanitizePayload } from './validation';
import {
  startGarageDeletionRoute,
  advanceGarageDeletionRoute,
  readGarageDeletionStatusRoute
} from './garageDeletionRoutes';
import { registerStaffRoutes } from './staffRoutes';
import { registerDelegateRoutes } from './delegateRoutes';
import { registerCreditGrantRoutes } from './creditGrantRoutes';
import { getCairoDateKey } from './projections';

export function registerGarageRoutes(app: WorkerApp): void {
// 10. Garage Management & System Hardening (CF8)

// Handler 1: Create Garage (POST /api/garages/create)
app.post('/api/garages/create', requireWorkerAuth, enforceWorkerFinancialRateLimit, async (c) => {
  try {
    const user = c.get('user');
    const callerRole = user?.role;
    const callerUid = user?.uid;
    const callerName = user?.displayName || '';

    if (!canSubmitGarageApplication(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Creation not permitted for role' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const retiredCreationFields = ['billingModel', 'dailyCapacity'];
    const retiredCreationField = retiredCreationFields.find((field) => body && typeof body === 'object' && body[field] !== undefined);
    if (retiredCreationField) return c.json({ success: false, error: 'RETIRED_GARAGE_FIELD', field: retiredCreationField }, 400);
    const sanitized = sanitizePayload(body, ['name', 'phone', 'hourlyRate', 'overnightRate', 'pin', 'isTrial', 'createdByDelegateId', 'createdByDelegateName', 'referrerId', 'referrerName', 'referredByGarageId', 'referredByGarageName', 'idempotencyKey'], false);
    const { phone: rawPhone, hourlyRate: rawHourlyRate, overnightRate: rawOvernightRate, createdByDelegateId, createdByDelegateName, referrerId, referrerName, referredByGarageId, referredByGarageName } = sanitized;
    const requestedTrial = sanitized.isTrial === true
      || sanitized.isTrial === 'true'
      || sanitized.isTrial === 'on'
      || sanitized.isTrial === '1';
    if (requestedTrial && callerRole !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Trial credits require Admin approval' }, 403);
    }
    const name = validateString(sanitized.name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(sanitized.pin);
    const idempotencyKey = validateIdempotencyKey(
      sanitized.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key')
    );

    const delegateEntityId = callerRole === 'delegate' ? (user?.entityId || callerUid) : undefined;
    let requestFingerprint: string | undefined;
    if (idempotencyKey) {
      const fingerprintPayload: Record<string, unknown> = { ...sanitized };
      delete fingerprintPayload.idempotencyKey;
      delete fingerprintPayload.pin;
      fingerprintPayload.pinLookupHash = computeLookupHash(normPin);
      requestFingerprint = createRequestFingerprint({
        callerRole: callerRole || null,
        delegateEntityId: delegateEntityId || null,
        payload: fingerprintPayload
      });
    }

    const readExistingResult = async (): Promise<{ isDuplicate: boolean; cachedResult?: any }> => {
      if (!idempotencyKey) return { isDuplicate: false };
      let duplicate: { isDuplicate: boolean; cachedResult?: any } = { isDuplicate: false };
      await adminDb.runTransaction(async (t: any) => {
        duplicate = await checkIdempotencyInTransaction(
          t, idempotencyKey, '/api/garages/create', callerUid, requestFingerprint
        );
      });
      return duplicate;
    };

    const initialDuplicate = await readExistingResult();
    if (initialDuplicate.isDuplicate) return c.json(initialDuplicate.cachedResult);

    let delegateQuotaDateKey: string | undefined;
    if (callerRole === 'delegate') {
      const cairoParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Cairo',
        year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date()).reduce<Record<string, string>>((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {});
      const cairoDateKey = `${cairoParts.year}-${cairoParts.month}-${cairoParts.day}`;
      delegateQuotaDateKey = cairoDateKey;
      const { start: cairoDayStart, end: cairoNextDayStart } = getCairoDayBounds(cairoDateKey);
      const delegateGaragesToday = await adminDb.collection('garages')
        .where('createdByDelegateId', '==', delegateEntityId)
        .where('createdAt', '>=', cairoDayStart)
        .where('createdAt', '<', cairoNextDayStart)
        .limit(3)
        .get();
      if (delegateGaragesToday.size >= 3) {
        const duplicate = await readExistingResult();
        if (duplicate.isDuplicate) return c.json(duplicate.cachedResult);
        return c.json({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' }, 409);
      }
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      const duplicate = await readExistingResult();
      if (duplicate.isDuplicate) return c.json(duplicate.cachedResult);
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const phone = rawPhone ? String(rawPhone).trim() : '';
    const hourlyRateValue = rawHourlyRate !== undefined
      ? validateNumber(rawHourlyRate, 'hourlyRate', { min: 0, max: 10000, required: false })
      : 0;
    const overnightRateValue = rawOvernightRate !== undefined
      ? validateNumber(rawOvernightRate, 'overnightRate', { min: 0, max: 10000, required: false })
      : 0;
    const now = new Date();
    const billingModel = 'prepaid_credits';
    // Trial credits: admin-created garages are approved immediately, so they
    // get 50 trial credits at creation. Delegate-created garages are pending
    // and get 0 credits — the 50 trial credits are granted automatically
    // when the admin approves them later (see /api/garages/update).
    // The delegate-side trial toggle was removed from the create-garage modal.
    const isTrial = callerRole === 'admin' || (!createdByDelegateId && !sanitized.createdByDelegateId);
    const trialCreditAmount = isTrial ? 50 : 0;
    const finalDailyCapacity = 0;
    const garageRef = adminDb.collection('garages').doc();
    const garageId = garageRef.id;
    const logRef = adminDb.collection('activity_logs').doc();
    const garageDoc: Record<string, any> = {
      name: name.trim(),
      phone,
      hourlyRate: hourlyRateValue,
      overnightRate: overnightRateValue,
      billingModel,
      status: (callerRole === 'delegate' || createdByDelegateId) ? 'pending' : 'approved',
      hasMonthlySubscribers: false,
      createdAt: now,
      isTrial,
      dailyCapacity: finalDailyCapacity,
      credits: trialCreditAmount,
      carsInside: 0,
      carsInsideCount: 0,
      todayCount: 0,
      todayRevenue: 0,
      totalRevenue: 0,
      totalAdminRevenue: 0,
      totalVehiclesOut: 0,
      dailyDeletionCount: 0,
      dailyRefundCount: 0,
      totalGaragesReferredCount: 0,
      isLocked: false,
      isDeleting: false
    };

    if (callerRole === 'delegate') {
      garageDoc.createdByDelegateId = delegateEntityId;
      garageDoc.createdByDelegateName = createdByDelegateName || callerName || 'المندوب';
      garageDoc.referrerId = delegateEntityId;
      garageDoc.referrerName = referrerName || createdByDelegateName || callerName || 'المندوب';
    } else if (createdByDelegateId) {
      garageDoc.createdByDelegateId = createdByDelegateId;
      garageDoc.createdByDelegateName = createdByDelegateName || 'المندوب';
      garageDoc.referrerId = referrerId || createdByDelegateId;
      garageDoc.referrerName = referrerName || createdByDelegateName || 'المندوب';
    }

    if (referredByGarageId) {
      garageDoc.referredByGarageId = referredByGarageId;
      garageDoc.referredByGarageName = referredByGarageName || '';
    }

    const activityLog = {
      garageId,
      garageName: garageDoc.name,
      staffId: callerUid || null,
      staffName: callerName || 'الإدارة (إنشاء جراج)',
      actionType: 'create',
      plateNumber: 'إنشاء حساب جراج جديد (نظام الرصيد)',
      timestamp: now,
      amount: 0,
      details: {
        durationDays: 0,
        carsCount: 0,
        revenueAmount: 0,
        isTrial,
        trialCreditsGranted: trialCreditAmount
      }
    };
    const result = { success: true, id: garageId };
    let replayedResult: any;
    let isReplay = false;
    let delegateQuotaExceeded = false;

    await adminDb.runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(
          t, idempotencyKey, '/api/garages/create', callerUid, requestFingerprint
        );
        if (duplicate.isDuplicate) {
          isReplay = true;
          replayedResult = duplicate.cachedResult;
          return;
        }
      }

      let delegateQuotaLockRef: any;
      if (callerRole === 'delegate' && delegateEntityId && delegateQuotaDateKey) {
        delegateQuotaLockRef = adminDb.collection('delegate_garage_creation_quota_locks')
          .doc(`${encodeURIComponent(delegateEntityId)}_${delegateQuotaDateKey}`);
        // Same-day creations by this delegate share one transactional lock.
        // Firestore retries conflicts, re-running the quota query after a concurrent commit.
        await t.get(delegateQuotaLockRef);
        const { start: cairoDayStart, end: cairoNextDayStart } = getCairoDayBounds(delegateQuotaDateKey);
        const delegateGaragesToday = await t.get(adminDb.collection('garages')
          .where('createdByDelegateId', '==', delegateEntityId)
          .where('createdAt', '>=', cairoDayStart)
          .where('createdAt', '<', cairoNextDayStart)
          .limit(3));
        if (delegateGaragesToday.size >= 3) {
          delegateQuotaExceeded = true;
          return;
        }
      }

      await saveEntityPinInTransaction(t, 'garages', garageId, normPin);
      t.set(garageRef, garageDoc);
      if (delegateQuotaLockRef) {
        t.set(delegateQuotaLockRef, {
          delegateId: delegateEntityId,
          dateKey: delegateQuotaDateKey,
          updatedAt: now
        }, { merge: true });
      }
      if (isTrial) {
        const trialTransition = grantTrialCredits({
          balance: 0,
          amount: trialCreditAmount,
          garageId,
          actorUid: callerUid,
          actorRole: callerRole || 'system',
          reason: 'New garage trial credit grant',
          occurredAt: now.toISOString(),
          idempotencyKey: `garage-create:${garageId}:trial`,
        });
        if (trialTransition.ok === false) throw new Error(trialTransition.error);
        const trialLedger = materializeCreditLedgerEntry(trialTransition.value.entry);
        if (trialLedger.ok === false) throw new Error(trialLedger.error);
        t.set(adminDb.doc(`credit_ledger/${trialLedger.value.entryId}`), {
          ...trialLedger.value,
          source: 'garage_creation_trial',
        });
      }
      t.set(maintainedGarageSummaryRef(garageId), {
        schemaVersion: MAINTAINED_SUMMARY_VERSION,
        garageId,
        name: garageDoc.name,
        carsInside: 0,
        totalSubscribersCount: 0,
        activeSubscribersCount: 0,
        expiredSubscribersCount: 0,
        isTrial,
        dailyCapacity: finalDailyCapacity,
        hourlyRate: hourlyRateValue,
        createdAt: now,
        updatedAt: now
      });
      writeMaintainedAdminDelta(t, {
        totalGarages: 1,
        activeGarages: 1
      });
      t.set(logRef, activityLog);
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t, idempotencyKey, result, '/api/garages/create', callerUid, requestFingerprint
        );
      }
    });

    if (delegateQuotaExceeded) {
      const duplicate = await readExistingResult();
      if (duplicate.isDuplicate) return c.json(duplicate.cachedResult);
      return c.json({ success: false, error: 'DELEGATE_DAILY_GARAGE_LIMIT_REACHED' }, 409);
    }

    return c.json(isReplay ? replayedResult : result);
  } catch (err: any) {
    console.error('[Worker Garage] Error creating garage:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Handler 2: Update Garage (POST /api/garages/update)
app.post('/api/garages/update', requireWorkerAuth, withErrorHandler(async (c) => {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const { id: rawId, ...data } = body || {};
    // Audit N11 (Phase 1, 2026-11-06): validate the id using validateId
    // (rejects whitespace, path-traversal chars, >128 chars). Previously
    // just checked truthiness — an attacker could send id with special
    // characters that would reach Firestore doc paths.
    const id = validateId(rawId, 'garageId', true);

    const retiredUpdateFields = new Set([
      'billingModel', 'commissionPerVehicle', 'monthlySubscriptionFee', 'dailyCapacity', 'capacity', 'allowMonthlySubscribers',
      'activePackageName', 'packageName', 'balance', 'balanceExpiry', 'balanceDays', 'carsInside',
      'lastBalanceDeduction', 'lastPaidFriday', 'lastRechargeAmount', 'lastRechargeDate', 'lastRechargePackageName',
      'totalRechargedCars', 'referralBonusBalance', 'referralRewardClaimed', 'referralRewardAwardedAt',
      'creditBalance', 'credits'
    ]);
    const retiredUpdateField = Object.keys(data).find((field) => retiredUpdateFields.has(field) && data[field] !== undefined);
    if (retiredUpdateField) return c.json({ success: false, error: 'RETIRED_GARAGE_FIELD', field: retiredUpdateField }, 400);

    const updates: Record<string, any> = { updatedAt: new Date() };
    const allowedKeys = [
      'name', 'phone', 'hourlyRate', 'overnightRate',
      'status', 'isLocked', 'lockReason', 'isSuspended', 'isMaintenanceMode',
      'maintenanceMessage', 'assignedDelegateId', 'currentSessionId',
      'hasMonthlySubscribers', 'checkInSound', 'checkOutSound', 'ownerName',
      'shimmerColor',
      'referredByGarageId', 'referredByGarageName', 'referrerId', 'referrerName', 'createdByDelegateId', 'createdByDelegateName'
    ];
    for (const key of allowedKeys) {
      if (key in data && data[key] !== undefined) {
        updates[key] = data[key];
      }
    }

    // NOTE (audit N3, 2026-11-06): `lastRateChangeDate` is intentionally NOT
    // in allowedKeys. The server sets it authoritatively below when rates
    // change, ignoring any client-supplied value. The previous version
    // silently dropped any client-supplied `lastRateChangeDate` (because
    // it wasn't in allowedKeys) but ALSO didn't enforce the 30-day cooldown
    // server-side — so a client could bypass the cooldown by sending a
    // tampered `lastRateChangeDate: new Date(0)` (which was ignored) AND
    // calling the API directly with new rates (which the server happily
    // accepted without checking the existing lastRateChangeDate in the
    // garage doc). The cooldown was client-side only. Now it's enforced
    // server-side inside the transaction below.

    // Atomic garage update + trial-credit grant on approval.
    //
    // Previously: the `update(updates)` and the trial-credits grant
    // happened as separate non-transactional writes. Two concurrent
    // approvals could both observe `isTrial === false`, both grant
    // 100 credits, and one grant would be silently dropped (lost-update).
    // Worse, if the trial grant failed, the garage was already moved to
    // 'approved' status without the credits — a financial inconsistency.
    //
    // Now: the entire update + trial grant happens in one transaction.
    // The `isTrial` flag is the idempotency guard — once it's true inside
    // the same transaction, no concurrent approval can re-grant.
    //
    // Audit ref: Phase 0 / N8 (consolidated audit, 2026-11-06).
    const RATE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = new Date();
    // Detect a rate-change request: admin is updating hourlyRate and/or
    // overnightRate to a different value than what's stored.
    const isRateChangeRequest =
      ('hourlyRate' in updates && updates.hourlyRate !== undefined) ||
      ('overnightRate' in updates && updates.overnightRate !== undefined);
    await adminDb.runTransaction(async (t: any) => {
      const garageRef = adminDb.collection('garages').doc(id);
      const garageSnap = await t.get(garageRef);
      const garageData = garageSnap.data() || {};

      // Server-side 30-day rate-change cooldown (audit N3).
      // The client-side check in src/utils/businessRules.ts is advisory;
      // this is the authoritative enforcement. Reading lastRateChangeDate
      // from the doc (NOT from the request body) is what makes the cooldown
      // tamper-proof.
      if (isRateChangeRequest) {
        const storedLastChange = garageData.lastRateChangeDate;
        let lastChangeMs: number | null = null;
        if (storedLastChange) {
          if (typeof storedLastChange === 'object' && storedLastChange && typeof (storedLastChange as any).toMillis === 'function') {
            lastChangeMs = (storedLastChange as any).toMillis();
          } else if (storedLastChange instanceof Date) {
            lastChangeMs = storedLastChange.getTime();
          } else if (typeof storedLastChange === 'string' || typeof storedLastChange === 'number') {
            const parsed = Date.parse(String(storedLastChange));
            lastChangeMs = Number.isFinite(parsed) ? parsed : null;
          }
        }
        if (lastChangeMs !== null && (now.getTime() - lastChangeMs) < RATE_CHANGE_COOLDOWN_MS) {
          const daysRemaining = Math.ceil((RATE_CHANGE_COOLDOWN_MS - (now.getTime() - lastChangeMs)) / (24 * 60 * 60 * 1000));
          const err = new Error('RATE_CHANGE_COOLDOWN_ACTIVE');
          (err as any).statusCode = 409;
          (err as any).daysRemaining = Math.max(1, daysRemaining);
          (err as any).nextAllowedDate = new Date(lastChangeMs + RATE_CHANGE_COOLDOWN_MS).toISOString();
          throw err;
        }
        // Stamp the rate-change timestamp authoritatively — server-side
        // only, never client-supplied.
        updates.lastRateChangeDate = now;
      }

      // Apply the field updates the admin requested. Use t.update (not
      // t.set with merge) so that a missing garage doc throws the
      // 'Document not found' error the API contract relies on.
      t.update(garageRef, updates);

      // Trial credits on approval: when an admin sets status → 'approved'
      // for the first time, grant 50 trial credits automatically IF the
      // garage hasn't already received them. This replaces the delegate-side
      // trial toggle that was removed from the create-garage modal — the
      // delegate no longer decides; the credits just happen on approval.
      if (updates.status === 'approved' && !garageData.isTrial) {
        const trialTransition = grantTrialCredits({
          balance: Number(garageData.credits || 0),
          amount: 50,
          garageId: id,
          actorUid: user?.uid || 'admin',
          actorRole: 'admin',
          reason: 'Trial credits granted on garage approval',
          occurredAt: now.toISOString(),
          idempotencyKey: `garage-approve:${id}:trial`,
        });
        if (trialTransition.ok === false) throw new Error(trialTransition.error);
        const trialLedger = materializeCreditLedgerEntry(trialTransition.value.entry);
        if (trialLedger.ok === false) throw new Error(trialLedger.error);

        t.set(adminDb.doc(`credit_ledger/${trialLedger.value.entryId}`), {
          ...trialLedger.value,
          source: 'garage_approval_trial',
        });
        // Mark isTrial + apply new credit balance in the same merge — this
        // is the write that closes the lost-update window.
        t.set(garageRef, {
          credits: trialTransition.value.balance,
          isTrial: true,
          updatedAt: now,
        }, { merge: true });
      }
    });

    // Only mark the admin summary stale when fields that actually affect the
    // summary counters change (isLocked → lockedGarages, status → activeGarages).
    // Routine edits (name, phone, rates, colors, etc.) do NOT require a full
    // collection scan to recompute the summary.
    const summaryAffectingFields = new Set(['isLocked', 'status', 'isTrial']);
    const affectsSummary = Object.keys(updates).some((key) => summaryAffectingFields.has(key));
    if (affectsSummary) {
      await maintainedAdminSummaryRef().set({ schemaVersion: MAINTAINED_SUMMARY_VERSION, summaryScope: 'admin', stale: true, updatedAt: new Date() }, { merge: true });
    }
    return c.json({ success: true });
  // withErrorHandler handles try/catch + RATE_CHANGE_COOLDOWN_ACTIVE (C3)
}, 'Garage'));

// Garage deletion handlers live in a dedicated module; all three routes share the same server authority.
app.post('/api/garages/delete', requireWorkerAuth, startGarageDeletionRoute);
app.post('/api/garages/delete-step', requireWorkerAuth, advanceGarageDeletionRoute);
app.get('/api/garages/delete-status', requireWorkerAuth, readGarageDeletionStatusRoute);

// Handler 4 & 5: Query Garages (GET /api/garages & GET /api/garages/:id)
app.get('/api/garages', requireWorkerAuth, withErrorHandler(async (c) => {
  const user = c.get('user');
  if (!['admin', 'delegate'].includes(user?.role || '')) {
    return c.json({ success: false, error: 'FORBIDDEN' }, 403);
  }

  const garagesCollection = adminDb.collection('garages');
  let query: any = garagesCollection;
  let pageScope = `garages:admin:${user.uid}`;
  if (user?.role === 'delegate') {
    const delegateId = user.entityId || user.uid;
    query = query.where('createdByDelegateId', '==', delegateId);
    pageScope = `garages:delegate:${delegateId}`;
  }

  let pageRequest;
  try {
    pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), pageScope);
  } catch (error: any) {
    return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
  }
  query = query.orderBy('__name__', 'desc');
  query = firestorePageStartAfter(query, garagesCollection, pageRequest.cursor, '__name__');
  const snap = await query.limit(pageRequest.pageSize + 1).get();
  const garagePage = buildFirestorePage(snap.docs, pageRequest, '__name__');
  const garages = garagePage.documents.map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));

  return c.json({ success: true, garages, items: garages, hasMore: garagePage.hasMore, nextCursor: garagePage.nextCursor });
}, 'Garage'));

// Read-only consistency diagnostics & Event Ledger reconciliation.
app.post('/api/garages/reconciliation', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'reconciliation')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const garageId = validateId(body?.garageId, 'garageId', true);
    const garageRef = adminDb.doc(`garages/${garageId}`);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    const today = getCairoDateKey(new Date());
    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(today);
    const [insideSnap, dailyStatsSnap, eventsSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get(),
      adminDb.collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'desc')
        .get()
    ]);
    const reconciliation = reconcileGarageState({
      today,
      insideVehicleCount: insideSnap.size,
      garage: garageSnap.data() || {},
      dailyStats: dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {},
      events: eventsSnap.docs.map((doc: any) => doc.data() || {})
    });

    return c.json({ success: true, data: { garageId, date: today, ...reconciliation } });
  } catch (err: any) {
    console.error('[Worker Garage] Error in reconciliation:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

app.post('/api/garages/dashboard-summary/rebuild', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'dashboard-summary/rebuild')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { garageId, date } = body || {};
    if (!garageId || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const targetDate = date || getCairoDateKey(new Date());
    if (!isValidDateKey(targetDate)) throw new Error('INVALID_DATE');

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const [bucketSnap, eventsSnap, garageSnap, dailyStatsSnap] = await Promise.all([
      adminDb.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', targetDate).get(),
      adminDb.collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'asc')
        .get(),
      adminDb.doc(`garages/${garageId}`).get(),
      adminDb.doc(`garages/${garageId}/daily_stats/${targetDate}`).get()
    ]);
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    const eventProjection = calculateDailyProjection(
      eventsSnap.docs.map((doc: any) => doc.data() || {}),
      targetDate
    );
    const summary = aggregateProjectionBuckets(bucketSnap.docs.map((doc: any) => doc.data() || {}));
    const reconciliation = reconcileDashboardSummary(summary, eventProjection);
    const legacy = garageSnap.data() || {};
    const dailyStats = dailyStatsSnap.data() || {};
    const dailyRevenue = parseMoneyAmount(dailyStats.revenue) ?? 0;
    const legacyDifferences = {
      activeVehicleCount: summary.activeVehicleCount - Number(legacy.carsInside || 0),
      entriesToday: summary.entriesToday - Number(dailyStats.count || 0),
      grossRevenue: Number((summary.grossRevenue - dailyRevenue).toFixed(2))
    };
    const summaryData = {
      ...summary,
      garageId,
      dateId: targetDate,
      rebuiltAt: new Date().toISOString(),
      rebuiltBy: user?.uid || 'admin',
      eventProjection,
      reconciliation,
      legacyDifferences
    };
    await adminDb.doc(`garages/${garageId}/dashboard_summary/current`).set(summaryData, { merge: true });
    return c.json({
      success: true,
      data: {
        summary: summaryData,
        bucketCount: bucketSnap.size ?? bucketSnap.docs.length,
        eventCount: eventsSnap.size ?? eventsSnap.docs.length,
        consistentWithEvents: reconciliation.consistent,
        legacyDifferences
      }
    });
  } catch (err: any) {
    console.error('[Worker Garage] Error rebuilding dashboard summary:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

app.post('/api/garages/rebuild-projections', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'rebuild-projections')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { garageId, date } = body || {};
    if (!garageId || !adminDb) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const targetDate = date || getCairoDateKey(new Date());
    if (!isValidDateKey(targetDate)) return c.json({ success: false, error: 'INVALID_DATE' }, 400);

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const eventsSnap = await adminDb.collection(`garages/${garageId}/events`)
      .where('occurredAt', '>=', dayStart.toISOString())
      .where('occurredAt', '<', nextDayStart.toISOString())
      .orderBy('occurredAt', 'asc')
      .get();

    const lastEvent = eventsSnap.docs.at(-1);
    const lastEventData = lastEvent?.data() || {};
    const eventWatermark = {
      lastProcessedOccurredAt: lastEventData.occurredAt || null,
      lastProcessedEventId: lastEventData.eventId || lastEvent?.id || null,
      projectionVersion: 1
    };
    const projection = calculateDailyProjection(
      eventsSnap.docs.map((doc: any) => doc.data() || {}),
      targetDate
    );
    const projectionRef = adminDb.doc(`garages/${garageId}/daily_stats/${targetDate}`);
    const projectionData = {
      ...projection,
      rebuiltAt: new Date().toISOString(),
      eventWatermark,
      rebuiltBy: user?.uid || 'admin'
    };

    await projectionRef.set(projectionData, { merge: true });
    return c.json({ success: true, data: { garageId, date: targetDate, projection: projectionData } });
  } catch (err: any) {
    console.error('[Worker Garage] Error in rebuild-projections:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

app.get('/api/garages/:id/dashboard-summary', requireWorkerAuth, withErrorHandler(async (c) => {
  const startedAt = Date.now();
  const garageId = validateId(c.req.param('id'), 'garageId', true);
  const user = c.get('user');
  if (!decideGarageScope(user, garageId)) return c.json({ success: false, error: 'FORBIDDEN: Garage summary scope required' }, 403);
  const today = getCairoDateKey(new Date());
  const [garageSnap, dailyStatsSnap] = await Promise.all([
    adminDb.doc(`garages/${garageId}`).get(),
    adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get()
  ]);
  if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
  const dailyStatsData = dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {};
  const report = dailyStatsData.reportAggregateVersion === 1 && dailyStatsData.report
    ? dailyStatsData.report
    : undefined;
  c.header('Server-Timing', `dashboard-summary;dur=${Date.now() - startedAt}`);
  // projection_buckets is no longer written on the hot path (efficiency fix #477).
  // The primary source is the maintained_summary daily doc; the stored rebuild
  // is a secondary safety net for older data.
  const maintainedDailyRef = adminDb.doc(`garages/${garageId}/maintained_summary/daily_${today}`);
  const maintainedDailySnap = await maintainedDailyRef.get();
  if (maintainedDailySnap.exists) {
    const md = maintainedDailySnap.data() || {};
    const summary = {
      activeVehicleCount: Number(garageSnap.data()?.carsInside || 0),
      entriesToday: Number(md.todayEntries || 0),
      exitsToday: Number(md.todayExits || 0),
      grossRevenue: Number(md.todayRevenue || 0),
      refundTotal: 0,
      netRevenue: Number(md.todayRevenue || 0),
      garageId,
      dateId: today,
      rebuiltAt: new Date().toISOString(),
      source: 'maintained_daily_summary',
      ...(report ? { report } : {})
    };
    c.header('X-Summary-Source', 'maintained_daily_summary');
    return c.json({ success: true, data: { garageId, summary } });
  }
  const summarySnap = await adminDb.doc(`garages/${garageId}/dashboard_summary/current`).get();
  if (!summarySnap.exists) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_NOT_READY' }, 404);
  const storedSummary = summarySnap.data() || {};
  if (!isFreshDashboardSummary(storedSummary, today)) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
  const normalizedMoney = normalizeStoredDashboardMoney(storedSummary);
  if (!normalizedMoney) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
  c.header('X-Summary-Source', 'stored_rebuild');
  return c.json({ success: true, data: { garageId, summary: { ...storedSummary, ...normalizedMoney, ...(report ? { report } : {}) } } });
}, 'Garage'));

app.get('/api/garages/:id', requireWorkerAuth, withErrorHandler(async (c) => {
  // Audit N11 (Phase 1, 2026-11-06): validate the id param using
  // validateId (same as POST /api/garages/:id/reconcile at line 771).
  // Previously this route just checked truthiness, allowing IDs with
  // whitespace or path-traversal characters to reach Firestore.
  const id = validateId(c.req.param('id'), 'garageId', true);
  const user = c.get('user');
  if (!decideGarageScope(user, id)) {
    return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
  }
  const docSnap = await adminDb.doc(`garages/${id}`).get();
  if (!docSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

  return c.json({ success: true, garage: { id: docSnap.id, ...docSnap.data() } });
}, 'Garage'));

  // Staff, delegate, and credit-grant routes are split into focused modules.
  registerStaffRoutes(app);
  registerDelegateRoutes(app);
  registerCreditGrantRoutes(app);
}
