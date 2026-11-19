/**
 * Handler 1: Create Garage (POST /api/garages/create).
 *
 * Body moved verbatim from server/garageRoutes.ts (audit Phase 3 file
 * split, 2026-11-19) — no logic changes.
 */

import type { WorkerApp } from '../cloudflareWorker';
import { enforceWorkerFinancialRateLimit } from '../cloudflareWorker';
import { adminDb } from '../firebaseAdmin';
import { requireWorkerAuth } from '../sessionInfrastructure';
import { canSubmitGarageApplication } from '../domain/authorization';
import { grantTrialCredits, materializeCreditLedgerEntry } from '../domain/prepaidCreditLedger';
import { MAINTAINED_SUMMARY_VERSION, maintainedGarageSummaryRef, writeMaintainedAdminDelta } from '../workerMaintenance';
import { checkIdempotencyInTransaction, createRequestFingerprint, storeIdempotencyInTransaction } from '../idempotency';
import { computeLookupHash } from '../pinCrypto';
import { checkPinAvailabilityAcrossAll, saveEntityPinInTransaction } from '../pinRepository';
import { generateUniquePin } from '../pinGeneration';
import { validateIdempotencyKey, validateNewPin, validateNumber, validateString, sanitizePayload } from '../validation';
import { getCairoDayBounds } from '../projections';
import { mapDomainErrorToStatus } from '../routes/helpers';

export function registerGarageCreate(app: WorkerApp): void {
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

    // PIN source-of-truth (delegate policy, 2026-11-15):
    //
    // - Delegate caller: PIN is generated server-side. The delegate must
    //   NEVER see or set the PIN — admin owns PIN delivery (by phone, out
    //   of band). If a delegate request includes a `pin` field, REJECT
    //   with DELEGATE_CANNOT_SET_PIN. This closes the security gap where
    //   a technical delegate could read or intercept the PIN before submit.
    //
    // - Admin caller: PIN is supplied by the admin via the admin modal.
    //   Admins are trusted to set PINs the same way they always have.
    //
    // `createdByDelegateId` is set when an admin is acting on behalf of
    // a delegate (rare admin path); we still let admin set the PIN in
    // that case, since the caller is admin.
    const isDelegateCaller = callerRole === 'delegate';
    let normPin: string;
    if (isDelegateCaller) {
      if (sanitized.pin !== undefined && sanitized.pin !== null && sanitized.pin !== '') {
        return c.json({ success: false, error: 'DELEGATE_CANNOT_SET_PIN' }, 400);
      }
      // Generate a unique PIN server-side. Availability check races are
      // handled inside the helper (retries up to 100 times, then falls
      // back to a wider random pool). Final uniqueness is re-verified
      // inside the create-garage transaction via checkPinAvailabilityAcrossAll.
      const generated = await generateUniquePin(
        async (candidate) => checkPinAvailabilityAcrossAll(candidate),
      );
      normPin = generated.pin;
    } else {
      normPin = validateNewPin(sanitized.pin);
    }
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
}
