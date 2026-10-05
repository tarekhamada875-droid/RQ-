import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest, sendApiError } from '../../middleware';
import { adminDb } from '../../firebaseAdmin';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction, createRequestFingerprint } from '../../idempotency';
import { recordDomainEventInTransaction } from '../../events';
import { initializeFairUse } from '../../unlimitedFairUse';
import { sanitizePayload, validateId, validateIdempotencyKey } from '../../validation';
import { mapDomainErrorToStatus } from '../helpers';
import { validatePackageCatalogRecord } from '../../packageCatalog';
import { applyReferralReward, decideReferralReward, extendSubscriptionExpiry } from '../../domain/subscriptionBilling';

export const directRechargeRouter = Router();

// Secure Server API: Server-Authoritative Garage Package Recharge Engine
directRechargeRouter.post('/recharge-garage', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  const ALLOWED_ROLES = ['admin'];
  if (!ALLOWED_ROLES.includes(req.user?.role || '')) {
    return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
  }
  try {
    const sanitized = sanitizePayload(req.body, ['garageId', 'packageId', 'adminDetails', 'idempotencyKey'], false);
    const garageId = validateId(sanitized.garageId, 'garageId', true);
    const packageId = validateId(sanitized.packageId, 'packageId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);
    if (!idempotencyKey) return sendApiError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED', req.correlationId);
    const callerUid = req.user?.uid;
    const callerRole = req.user?.role || '';
    const adminDetails = sanitized.adminDetails || {};
    const requestFingerprint = createRequestFingerprint({ garageId, packageId, adminDetails });

    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    if (callerRole === 'delegate') {
      const delegateGarageSnap = await adminDb.doc(`garages/${garageId}`).get();
      const delegateGarageData = delegateGarageSnap.exists ? delegateGarageSnap.data() || {} : {};
      const ownsGarage =
        delegateGarageData.createdByDelegateId === req.user?.entityId ||
        delegateGarageData.referrerId === req.user?.entityId;
      if (!ownsGarage) {
        return sendApiError(res, 403, 'GARAGE_SCOPE_MISMATCH', 'GARAGE_SCOPE_MISMATCH', req.correlationId);
      }
    }

    const pkgSnap = await adminDb.doc(`packages/${packageId}`).get();
    if (!pkgSnap.exists) {
      return sendApiError(res, 404, 'NOT_FOUND', 'PACKAGE_NOT_FOUND', req.correlationId);
    }
    const packageObj = { id: pkgSnap.id, ...pkgSnap.data() };
    if (packageObj.isActive === false) {
      return sendApiError(res, 409, 'PACKAGE_INACTIVE', 'PACKAGE_INACTIVE', req.correlationId);
    }

    const validatedPackage = validatePackageCatalogRecord(packageObj, packageObj.id);
    const durationDays = validatedPackage.durationDays;
    const basePrice = validatedPackage.basePrice;
    const discountAmount = validatedPackage.discountAmount;
    const price = validatedPackage.finalPrice;
    const packageName = validatedPackage.name;
    const isUnlimited = validatedPackage.isUnlimited;
    const effCapacity = validatedPackage.dailyCapacity;

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/recharge-garage', callerUid, requestFingerprint);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) {
        throw new Error('GARAGE_NOT_FOUND');
      }

      const garageData = garageSnap.data() || {};

      if (garageData.hasMonthlySubscribers === true && durationDays < 15) {
        throw new Error('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION');
      }

      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, durationDays);

      const referrerGarageId = garageData.referredByGarageId;
      let referrerRef: any = null;
      let referrerSnap: any = null;
      const isEligibleForReferral = decideReferralReward({
        referrerGarageId,
        targetGarageId: garageId,
        durationDays,
        price,
        requiresPositivePrice: true
      }).eligible;

      if (isEligibleForReferral && referrerGarageId) {
        referrerRef = adminDb.doc(`garages/${referrerGarageId}`);
        referrerSnap = await t.get(referrerRef);
      }

      const newRevenue = Number(((garageData.totalAdminRevenue || 0) + price).toFixed(2));

      const updateData: any = {
        totalAdminRevenue: newRevenue,
        isLocked: false,
        isTrial: false,
        dailyCapacity: effCapacity,
        activePackageName: packageName,
        packageName: packageName,
        lastRechargeDate: new Date(),
        lastRechargeAmount: price,
        lastRechargePackageName: packageName,
        balanceExpiry: baseDate,
        billingModel: 'subscription',
        unlimitedFairUse: isUnlimited ? initializeFairUse(durationDays, packageName) : null
      };

      t.set(garageRef, updateData, { merge: true });

      const logRef = adminDb.collection('activity_logs').doc();
      const staffNameText = adminDetails.staffName || 'مدير النظام (Admin)';
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: adminDetails.staffId ? validateId(adminDetails.staffId, 'staffId') : (callerUid || 'admin'),
        staffName: staffNameText,
        actionType: 'recharge',
        plateNumber: `تجديد اشتراك: ${packageName} (${durationDays} يوم) - ${price} ج`,
        timestamp: new Date(),
        amount: price,
        packageId: packageId || packageObj.id || 'direct_recharge',
        details: {
          packageName,
          durationDays,
          carsCount: effCapacity,
          revenueAmount: price,
          originalRevenueAmount: price,
          discountAmount,
          rechargedBy: staffNameText
        }
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'recharge',
        aggregateId: idempotencyKey || `direct_${garageId}_${Date.now()}`,
        eventType: 'recharge_approved',
        actorUid: callerUid || 'admin',
        actorRole: callerRole,
        idempotencyKey: idempotencyKey || undefined,
        payload: { source: 'direct_admin_recharge', packageId, packageName, amount: price, originalAmount: basePrice, discountAmount, durationDays, dailyCapacity: effCapacity }
      });

      if (isEligibleForReferral && referrerRef && referrerSnap && referrerSnap.exists) {
        const referrerData = referrerSnap.data() || {};
        const refBaseDate = applyReferralReward(referrerData.balanceExpiry, 1);

        t.set(referrerRef, {
          balanceExpiry: refBaseDate,
          totalGaragesReferredCount: (referrerData.totalGaragesReferredCount || 0) + 1,
          lastReferralRewardAt: new Date()
        }, { merge: true });

        const rewardLogRef = adminDb.collection('activity_logs').doc();
        t.set(rewardLogRef, {
          garageId: referrerGarageId,
          garageName: referrerData.name || '',
          staffId: null,
          staffName: 'النظام — مكافأة إحالة تلقائية',
          actionType: 'recharge',
          plateNumber: `🎉 مكافأة إحالة تلقائية: تمديد الاشتراك +1 يوم مجاناً لإحالة ${garageData.name || ''}`,
          timestamp: new Date(),
          amount: 0,
          packageId: 'referral_reward',
          details: {
            type: 'referral_reward',
            referrerGarageId: referrerGarageId,
            referredGarageId: garageId,
            rewardDaysGiven: 1
          }
        });
      }

      resultData = {
        newExpiry: baseDate.toISOString(),
        totalAdminRevenue: newRevenue
      };

      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/recharge-garage', callerUid, requestFingerprint);
    });

    return res.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Server Transaction] Error in recharge-garage:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});
