import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest, sendApiError } from '../middleware';
import { adminDb } from '../firebaseAdmin';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction, createRequestFingerprint } from '../idempotency';
import { recordDomainEventInTransaction } from '../events';
import { initializeFairUse } from '../unlimitedFairUse';
import { sanitizePayload, validateId, validateNumber, validateIdempotencyKey } from '../validation';
import { mapDomainErrorToStatus } from './helpers';
import { validatePackageCatalogRecord } from '../packageCatalog';

const router = Router();

// Secure Server API: Server-Authoritative Garage Package Recharge Engine
router.post('/recharge-garage', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
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

      let baseDate = new Date();
      const currentExpiry = garageData.balanceExpiry;
      if (currentExpiry) {
        const currentExpDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
        if (!isNaN(currentExpDate.getTime()) && currentExpDate.getTime() > baseDate.getTime()) {
          baseDate = currentExpDate;
        }
      }
      baseDate.setDate(baseDate.getDate() + durationDays);

      const referrerGarageId = garageData.referredByGarageId;
      let referrerRef: any = null;
      let referrerSnap: any = null;
      const isEligibleForReferral =
        Boolean(referrerGarageId) &&
        referrerGarageId !== garageId &&
        price > 0 &&
        durationDays > 1;

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
        t.set(referrerRef, {
          totalReferralRewardDays: (referrerData.totalReferralRewardDays || 0) + 1,
          totalGaragesReferredCount: (referrerData.totalGaragesReferredCount || 0) + 1,
          lastReferralRewardAt: new Date()
        }, { merge: true });

        const rewardLogRef = adminDb.collection('activity_logs').doc();
        t.set(rewardLogRef, {
          garageId: referrerGarageId,
          garageName: referrerData.name || '',
          staffId: null,
          staffName: 'النظام — مكافأة إحالة',
          actionType: 'recharge',
          plateNumber: `مكافأة إحالة من ${garageData.name || ''} — إضافة يوم مجاني برصيد المكافآت`,
          timestamp: new Date(),
          amount: 0,
          packageId: referrerData.packageId || 'referral_reward',
          details: {
            type: 'referral_reward',
            referrerGarageId: referrerGarageId,
            referredGarageId: garageId
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

// Secure Server API: Approve Recharge Request
router.post('/approve-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  if (req.user?.role !== 'admin') {
    return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
  }
  const callerUid = req.user?.uid;
  try {
    const sanitized = sanitizePayload(req.body, ['requestId', 'idempotencyKey'], false);
    const reqId = validateId(sanitized.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      // Idempotency check
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/approve-recharge-request', callerUid);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }

      const requestRef = adminDb.doc(`recharge_requests/${reqId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const requestData = requestSnap.data() || {};
      if (requestData.status && requestData.status !== 'pending') {
        throw new Error('REQUEST_ALREADY_PROCESSED');
      }

      const targetGarageId = validateId(requestData.garageId, 'garageId', true);
      const garageRef = adminDb.doc(`garages/${targetGarageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) {
        throw new Error('GARAGE_NOT_FOUND');
      }

      const garageData = garageSnap.data() || {};

      // A balance-top-up request is a wallet credit, not a package purchase.
      // Keep it on its own state transition so it cannot grant subscription
      // time, package capacity, monthly statistics, or delegate commission.
      if (requestData.requestType === 'balance_topup') {
        const amount = validateNumber(requestData.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true });
        const previousBalance = Number(garageData.balance || 0);
        const newBalance = previousBalance + amount;

        t.set(garageRef, { balance: newBalance }, { merge: true });
        t.set(requestRef, {
          status: 'approved',
          amount,
          revenueAmount: amount,
          resolvedAt: new Date()
        }, { merge: true });

        const logRef = adminDb.collection('activity_logs').doc();
        t.set(logRef, {
          garageId: targetGarageId,
          garageName: garageData.name || '',
          staffId: callerUid || 'admin',
          staffName: 'مدير النظام (Admin)',
          actionType: 'balance_topup',
          plateNumber: `اعتماد شحن رصيد (${amount} ج.م)`,
          timestamp: new Date(),
          amount,
          details: {
            action: 'approved_balance_topup',
            requestId: reqId,
            previousBalance,
            newBalance
          }
        });

        recordDomainEventInTransaction(t, adminDb, {
          garageId: targetGarageId,
          aggregateType: 'wallet',
          aggregateId: reqId,
          eventType: 'wallet_topup_approved',
          actorUid: callerUid || 'system',
          actorRole: 'admin',
          idempotencyKey: idempotencyKey || undefined,
          payload: { requestId: reqId, amount, previousBalance, newBalance }
        });

        resultData = { requestId: reqId, status: 'approved', amount, previousBalance, newBalance };
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid);
        return;
      }

      // System config for subscriber flat fee & commissions
      const settingsSnap = await t.get(adminDb.doc('system_config/global'));
      const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};
      const subscriberFlatFee = systemConfig?.subscriberFlatFee !== undefined
        ? Math.max(0, Number(systemConfig.subscriberFlatFee))
        : (systemConfig?.monthlySubscribersFlatFee !== undefined ? Number(systemConfig.monthlySubscribersFlatFee) : 500);
      const delegateMonthlyCommission = systemConfig?.delegateMonthlyCommission !== undefined
        ? Number(systemConfig.delegateMonthlyCommission)
        : 100;

      const referredByDelegate = Boolean(garageData.createdByDelegateId || garageData.referrerId);
      const delegateReferrerId = garageData.createdByDelegateId || garageData.referrerId || null;

      let durationDays = Number(requestData.durationDays || requestData.vehiclesCount || 30);
      let basePrice = Number(requestData.revenueAmount !== undefined ? requestData.revenueAmount : (requestData.price || 0));
      let pkgName = String(requestData.packageName || '');
      let packageDiscountAmount = 0;

      if (!requestData.packageId) {
        throw new Error('PACKAGE_NOT_FOUND');
      }

      let isUnlimitedPkg = false;
      let effCapacity = 40;

      if (requestData.packageId) {
        const pkgRef = adminDb.doc(`packages/${requestData.packageId}`);
        const pkgSnap = await t.get(pkgRef);
        if (pkgSnap.exists) {
          const pData = pkgSnap.data() || {};
          const validatedPackage = validatePackageCatalogRecord(pData, requestData.packageId);
          basePrice = validatedPackage.basePrice;
          durationDays = validatedPackage.durationDays;
          packageDiscountAmount = validatedPackage.discountAmount;
          pkgName = validatedPackage.name;
          effCapacity = validatedPackage.dailyCapacity;
          isUnlimitedPkg = validatedPackage.isUnlimited;
        } else if (requestData.requestType !== 'balance_topup') {
          throw new Error('PACKAGE_NOT_FOUND');
        }
      } else if (requestData.requestType !== 'balance_topup') {
        throw new Error('PACKAGE_NOT_FOUND');
      }

      const targetDelegateId = delegateReferrerId || requestData.delegateId || null;
      let delegateRef: any = null;
      let delegateSnap: any = null;
      if (targetDelegateId) {
        delegateRef = adminDb.doc(`delegates/${targetDelegateId}`);
        delegateSnap = await t.get(delegateRef);
      }

      let commission = 0;
      if (referredByDelegate && targetDelegateId) {
        const currentMonthKey = new Date().toISOString().slice(0, 7);
        const monthlyStatsRef = adminDb.doc(`garage_monthly_stats/${targetGarageId}_${currentMonthKey}`);
        const monthlyStatsSnap = await t.get(monthlyStatsRef);
        const monthlyStatsData = monthlyStatsSnap.exists ? monthlyStatsSnap.data() : {};

        const prevDaysPurchased = Number(monthlyStatsData.totalDaysPurchased || 0);
        const newDaysPurchased = prevDaysPurchased + durationDays;
        const alreadyPaid = Boolean(monthlyStatsData.paid100EgpCommission);

        if (!alreadyPaid && (durationDays >= 30 || newDaysPurchased >= 10)) {
          commission = delegateMonthlyCommission > 0 ? delegateMonthlyCommission : 100;
        }

        t.set(monthlyStatsRef, {
          garageId: targetGarageId,
          delegateId: targetDelegateId,
          monthKey: currentMonthKey,
          totalDaysPurchased: newDaysPurchased,
          paid100EgpCommission: alreadyPaid || commission > 0,
          updatedAt: new Date()
        }, { merge: true });
      }

      const effectiveOriginalRevenue = basePrice;
      const discountAmount = packageDiscountAmount;
      let effectiveRevenue = Math.max(0, basePrice - discountAmount);
      if (garageData.hasMonthlySubscribers === true) {
        effectiveRevenue += subscriberFlatFee;
      }

      let baseDate = new Date();
      const currentExpiry = garageData.balanceExpiry;
      if (currentExpiry) {
        const expDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
        if (!isNaN(expDate.getTime()) && expDate.getTime() > baseDate.getTime()) {
          baseDate = expDate;
        }
      }
      baseDate.setDate(baseDate.getDate() + durationDays);

      t.set(garageRef, {
        balanceExpiry: baseDate,
        dailyCapacity: effCapacity,
        activePackageName: pkgName || requestData.packageName || 'الباقة',
        packageName: pkgName || requestData.packageName || 'الباقة',
        billingModel: 'subscription',
        isLocked: false,
        isTrial: false,
        totalAdminRevenue: (garageData.totalAdminRevenue || 0) + effectiveRevenue,
        lastRechargeDate: new Date(),
        lastRechargeAmount: effectiveRevenue,
        lastRechargePackageName: requestData.packageName || null,
        unlimitedFairUse: isUnlimitedPkg ? initializeFairUse(durationDays, pkgName || requestData.packageName || '') : null
      }, { merge: true });

      t.set(requestRef, {
        status: 'approved',
        commission: commission,
        referrerId: delegateReferrerId,
        amount: effectiveRevenue,
        revenueAmount: effectiveRevenue,
        originalRevenueAmount: effectiveOriginalRevenue,
        resolvedAt: new Date()
      }, { merge: true });

      if (delegateRef && delegateSnap && delegateSnap.exists) {
        const delData = delegateSnap.data() || {};
        t.set(delegateRef, {
          totalRechargedAmount: (delData.totalRechargedAmount || 0) + effectiveRevenue,
          totalCommissionEarned: (delData.totalCommissionEarned || 0) + commission
        }, { merge: true });
      }

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId: targetGarageId,
        garageName: requestData.garageName || garageData.name || '',
        staffId: delegateReferrerId || requestData.delegateId || null,
        staffName: requestData.delegateName || null,
        actionType: 'recharge',
        plateNumber: `شحن ${requestData.packageName || 'الباقة'} (${durationDays} يوم - ${effCapacity === 0 ? 'مفتوح' : `${effCapacity} سيارة`})`,
        timestamp: new Date(),
        amount: effectiveRevenue,
        packageId: requestData.packageId || null,
        details: {
          packageName: requestData.packageName,
          durationDays,
          carsCount: effCapacity,
          revenueAmount: effectiveRevenue,
          commission: commission,
          requestId: reqId
        }
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId: targetGarageId,
        aggregateType: 'recharge',
        aggregateId: reqId,
        eventType: 'recharge_approved',
        actorUid: callerUid || 'system',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        payload: { requestId: reqId, amount: effectiveRevenue, originalAmount: effectiveOriginalRevenue, durationDays, packageId: requestData.packageId || null, delegateId: targetDelegateId, commission }
      });
      if (commission > 0 && targetDelegateId) {
        recordDomainEventInTransaction(t, adminDb, {
          garageId: 'global',
          aggregateType: 'delegate',
          aggregateId: targetDelegateId,
          eventType: 'commission_earned',
          actorUid: callerUid || 'system',
          actorRole: 'admin',
          idempotencyKey: idempotencyKey || undefined,
          eventCollectionPath: `delegates/${targetDelegateId}/events`,
          payload: { delegateId: targetDelegateId, commissionAmount: commission, sourceRechargeId: reqId, earnedAt: new Date().toISOString() }
        });
      }

      resultData = {
        requestId: reqId,
        status: 'approved',
        newExpiry: baseDate.toISOString(),
        revenue: effectiveRevenue,
        commission
      };

      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid);
    });

    return res.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Server Transaction] Error in approve-recharge-request:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});

// Secure Server API: Reject Recharge Request
router.post('/reject-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  if (req.user?.role !== 'admin') {
    return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
  }
  const callerUid = req.user?.uid;
  try {
    const sanitized = sanitizePayload(req.body, ['requestId', 'idempotencyKey'], false);
    const requestId = validateId(sanitized.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/reject-recharge-request', callerUid);
      if (isDuplicate) {
        return;
      }

      const requestRef = adminDb.doc(`recharge_requests/${requestId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const currentStatus = requestSnap.data()?.status;
      if (currentStatus && currentStatus !== 'pending') {
        throw new Error('REQUEST_ALREADY_PROCESSED');
      }

      t.set(requestRef, {
        status: 'rejected',
        resolvedAt: new Date()
      }, { merge: true });

      const requestData = requestSnap.data() || {};
      recordDomainEventInTransaction(t, adminDb, {
        garageId: validateId(requestData.garageId, 'garageId', true),
        aggregateType: 'recharge',
        aggregateId: requestId,
        eventType: 'recharge_rejected',
        actorUid: callerUid || 'system',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        payload: { requestId, rejectedAt: new Date().toISOString(), reason: requestData.rejectionReason || null }
      });

      storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/transactions/reject-recharge-request', callerUid);
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Server Transaction] Error in reject-recharge-request:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});

// Secure Server API: Admin Direct Balance Top-Up
router.post('/admin-topup-balance', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  if (req.user?.role !== 'admin') {
    return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
  }
  const callerUid = req.user?.uid;
  try {
    const sanitized = sanitizePayload(req.body, ['garageId', 'amount', 'idempotencyKey'], false);
    const garageId = validateId(sanitized.garageId, 'garageId', true);
    const numAmount = validateNumber(sanitized.amount, 'amount', { min: 1, max: 1000000, integerOnly: true });
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);
    if (!idempotencyKey) return sendApiError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED', req.correlationId);
    const requestFingerprint = createRequestFingerprint({ garageId, amount: numAmount });

    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/admin-topup-balance', callerUid, requestFingerprint);
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
      const currentBalance = Number(garageData.balance || 0);
      const newBalance = currentBalance + numAmount;

      t.set(garageRef, {
        balance: newBalance,
        totalAdminRevenue: (garageData.totalAdminRevenue || 0) + numAmount,
        lastRechargeDate: new Date(),
        lastRechargeAmount: numAmount,
        lastRechargePackageName: `شحن رصيد مباشر (${numAmount} ج.م)`
      }, { merge: true });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: callerUid || 'admin',
        staffName: 'مدير النظام (Admin)',
        actionType: 'balance_topup',
        plateNumber: `شحن رصيد مباشر (${numAmount} ج.م)`,
        timestamp: new Date(),
        amount: numAmount,
        details: {
          action: 'admin_balance_topup',
          amount: numAmount,
          previousBalance: currentBalance,
          newBalance
        }
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'wallet',
        aggregateId: garageId,
        eventType: 'wallet_topup_approved',
        actorUid: callerUid || 'admin',
        actorRole: 'admin',
        idempotencyKey,
        payload: { amount: numAmount, previousBalance: currentBalance, newBalance, source: 'admin_direct_topup' }
      });

      resultData = { garageId, newBalance, addedAmount: numAmount };

      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/admin-topup-balance', callerUid, requestFingerprint);
    });

    return res.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Server Transaction] Error in admin-topup-balance:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});

// Secure Server API: Garage Self-Service Subscription Using Balance
router.post('/garage-self-subscribe', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  const userRole = req.user?.role;
  const userGarageId = req.user?.garageId || req.user?.entityId;
  const callerUid = req.user?.uid;
  try {
    const sanitized = sanitizePayload(req.body, ['garageId', 'packageId', 'packageData', 'idempotencyKey'], false);
    const bodyGarageId = validateId(sanitized.garageId, 'garageId', false);
    const packageId = validateId(sanitized.packageId, 'packageId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);
    if (!idempotencyKey) return sendApiError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED', req.correlationId);
    const garageId = userRole === 'garage' ? userGarageId : (bodyGarageId || userGarageId);
    const requestFingerprint = createRequestFingerprint({ garageId, packageId });
    if (userRole === 'garage' && userGarageId && bodyGarageId && userGarageId !== bodyGarageId) {
      return sendApiError(res, 403, 'FORBIDDEN', 'UNAUTHORIZED_GARAGE_ACCESS', req.correlationId);
    }
    if (!['garage', 'admin'].includes(userRole || '')) {
      return sendApiError(res, 403, 'FORBIDDEN', 'FORBIDDEN: Role not authorized for self subscribe', req.correlationId);
    }
    if (!garageId) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'GARAGE_ID_REQUIRED', req.correlationId);
    }
    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/garage-self-subscribe', callerUid, requestFingerprint);
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
      const currentBalance = Number(garageData.balance || 0);

      const settingsSnap = await t.get(adminDb.doc('system_config/global'));
      const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};
      const subscriberFlatFee = systemConfig?.subscriberFlatFee !== undefined
        ? Math.max(0, Number(systemConfig.subscriberFlatFee))
        : (systemConfig?.monthlySubscribersFlatFee !== undefined ? Number(systemConfig.monthlySubscribersFlatFee) : 500);

      let pkg: any = null;
      if (packageId) {
        const pkgRef = adminDb.doc(`packages/${packageId}`);
        const pkgSnap = await t.get(pkgRef);
        if (pkgSnap.exists) {
          pkg = { id: pkgSnap.id, ...pkgSnap.data() };
        }
      }

      if (!pkg) {
        throw new Error('PACKAGE_NOT_FOUND');
      }
      if (pkg.isActive === false) {
        throw new Error('PACKAGE_INACTIVE');
      }

      const validatedPackage = validatePackageCatalogRecord(pkg, pkg.id || packageId);
      const durationDays = validatedPackage.durationDays;
      const effectivePriceBeforeSubscriberFee = validatedPackage.finalPrice;
      let effectivePrice = effectivePriceBeforeSubscriberFee;
      if (garageData.hasMonthlySubscribers === true) {
        effectivePrice += subscriberFlatFee;
      }

      if (currentBalance < effectivePrice) {
        throw new Error(`INSUFFICIENT_BALANCE: الرصيد المتاح (${currentBalance} ج.م) غير كافٍ للاشتراك في هذه الباقة (${effectivePrice} ج.م)`);
      }

      const newBalance = currentBalance - effectivePrice;

      let baseDate = new Date();
      const currentExpiry = garageData.balanceExpiry;
      if (currentExpiry) {
        const expDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
        if (!isNaN(expDate.getTime()) && expDate.getTime() > baseDate.getTime()) {
          baseDate = expDate;
        }
      }
      baseDate.setDate(baseDate.getDate() + durationDays);

      const pkgName = validatedPackage.name;
      const isUnlimitedPkg = validatedPackage.isUnlimited;
      const effCapacity = validatedPackage.dailyCapacity;

      t.set(garageRef, {
        balance: newBalance,
        balanceExpiry: baseDate,
        dailyCapacity: effCapacity,
        activePackageName: pkgName,
        packageName: pkgName,
        billingModel: 'subscription',
        isLocked: false,
        isTrial: false,
        lastRechargeDate: new Date(),
        lastRechargeAmount: effectivePrice,
        lastRechargePackageName: pkgName,
        unlimitedFairUse: isUnlimitedPkg ? initializeFairUse(durationDays, pkgName) : null
      }, { merge: true });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: callerUid || 'owner',
        staffName: garageData.ownerName || 'مدير الجراج',
        actionType: 'self_subscribe',
        plateNumber: `تفعيل باقة بالرصيد: ${pkgName} (${durationDays} يوم)`,
        timestamp: new Date(),
        amount: effectivePrice,
        packageId: pkg.id || packageId,
        details: {
          packageName: pkgName,
          durationDays,
          carsCount: effCapacity,
          cost: effectivePrice,
          previousBalance: currentBalance,
          remainingBalance: newBalance
        }
      });

      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'wallet',
        aggregateId: garageId,
        eventType: 'wallet_debited',
        actorUid: callerUid || 'system',
        actorRole: userRole || 'garage',
        idempotencyKey,
        payload: { amount: effectivePrice, previousBalance: currentBalance, newBalance, reason: 'package_purchase', packageId: pkg.id || packageId }
      });
      recordDomainEventInTransaction(t, adminDb, {
        garageId,
        aggregateType: 'recharge',
        aggregateId: idempotencyKey,
        eventType: 'package_purchased',
        actorUid: callerUid || 'system',
        actorRole: userRole || 'garage',
        idempotencyKey,
        payload: { packageId: pkg.id || packageId, packageName: pkgName, amount: effectivePrice, durationDays, dailyCapacity: effCapacity, previousBalance: currentBalance, remainingBalance: newBalance }
      });

      resultData = {
        garageId,
        newBalance,
        newExpiry: baseDate.toISOString(),
        packageName: pkgName,
        deductedAmount: effectivePrice
      };

      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/garage-self-subscribe', callerUid, requestFingerprint);
    });

    return res.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Server Transaction] Error in garage-self-subscribe:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});

// Secure Server API: Garage Referral Reward Claim
router.post('/use-referral-reward', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  try {
    const sanitized = sanitizePayload(req.body, ['garageId', 'idempotencyKey'], false);
    const garageId = validateId(sanitized.garageId, 'garageId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);

    const callerUid = req.user?.uid;
    const callerRole = req.user?.role;
    const callerGarageId = req.user?.garageId || (callerRole === 'garage' ? req.user?.entityId : null);

    if (callerRole !== 'admin' && callerRole !== 'garage') {
      return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_OR_GARAGE_ONLY', req.correlationId);
    }
    if (callerRole === 'garage' && callerGarageId !== garageId) {
      return sendApiError(res, 403, 'FORBIDDEN', 'FORBIDDEN: Cannot claim reward for another garage', req.correlationId);
    }

    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    let claimedDays = 0;
    await adminDb.runTransaction(async (t) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/use-referral-reward', callerUid);
      if (isDuplicate) {
        claimedDays = cachedResult?.daysClaimed || 0;
        return;
      }

      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) {
        throw new Error('GARAGE_NOT_FOUND');
      }

      const garageData = garageSnap.data() || {};
      const rewardDays = Math.max(0, Number(garageData.totalReferralRewardDays || 0));
      if (rewardDays <= 0) {
        throw new Error('NO_REFERRAL_REWARDS_AVAILABLE');
      }

      claimedDays = rewardDays;
      let baseDate = new Date();
      const currentExpiry = garageData.balanceExpiry;
      if (currentExpiry) {
        const expDate = currentExpiry.toDate ? currentExpiry.toDate() : new Date(currentExpiry);
        if (expDate > baseDate) {
          baseDate = expDate;
        }
      }

      baseDate.setDate(baseDate.getDate() + rewardDays);

      t.update(garageRef, {
        balanceExpiry: baseDate,
        totalReferralRewardDays: 0,
        isLocked: false,
        lastReferralClaimAt: new Date()
      });

      const logRef = adminDb.collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: callerUid || null,
        staffName: callerRole === 'admin' ? 'الإدارة' : 'صاحب الجراج (استخدام رصيد المكافآت)',
        actionType: 'recharge',
        plateNumber: `استخدام مكافأة إحالة — تمديد الاشتراك +${rewardDays} ${rewardDays === 1 ? 'يوم مجاني' : rewardDays === 2 ? 'يومان مجانيان' : 'أيام مجانية'}`,
        timestamp: new Date(),
        amount: 0,
        details: {
          type: 'use_referral_reward',
          claimedDays: rewardDays,
          newExpiry: baseDate.toISOString()
        }
      });

      storeIdempotencyInTransaction(t, idempotencyKey, { daysClaimed: claimedDays }, '/api/transactions/use-referral-reward', callerUid);
    });

    return res.json({ success: true, daysClaimed: claimedDays });
  } catch (e: any) {
    console.error('[Server Reward] Error in use-referral-reward:', e);
    const { statusCode, code, message } = mapDomainErrorToStatus(e);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});

export default router;
