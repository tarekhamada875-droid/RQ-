import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest, sendApiError } from '../../middleware';
import { adminDb } from '../../firebaseAdmin';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction, createRequestFingerprint } from '../../idempotency';
import { recordDomainEventInTransaction } from '../../events';
import { initializeFairUse } from '../../unlimitedFairUse';
import { sanitizePayload, validateId, validateNumber, validateIdempotencyKey } from '../../validation';
import { mapDomainErrorToStatus } from '../helpers';
import { validatePackageCatalogRecord } from '../../packageCatalog';
import { decideManualCredit } from '../../domain/manualCredit';

export const requestApprovalRouter = Router();

// Secure Server API: Approve Recharge Request
requestApprovalRouter.post('/approve-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  if (req.user?.role !== 'admin') {
    return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
  }
  const callerUid = req.user?.uid;
  try {
    const sanitized = sanitizePayload(req.body, ['requestId', 'idempotencyKey'], false);
    const reqId = validateId(sanitized.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);
    if (!idempotencyKey) return sendApiError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED', req.correlationId);

    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    let resultData: any = null;

    await adminDb.runTransaction(async (t: any) => {
      const requestRef = adminDb.doc(`recharge_requests/${reqId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const requestData = requestSnap.data() || {};
      const requestFingerprint = createRequestFingerprint({
        requestId: reqId,
        garageId: requestData.garageId || null,
        requestType: requestData.requestType || null,
        amount: requestData.amount ?? requestData.revenueAmount ?? requestData.price ?? null,
        packageId: requestData.packageId || null,
        durationDays: requestData.durationDays ?? requestData.vehiclesCount ?? null,
      });
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }
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
        const creditDecision = decideManualCredit({ amount, previousBalance: Number(garageData.balance || 0) });
        if (creditDecision.ok === false) throw new Error(creditDecision.error);
        const { previousBalance, newBalance } = creditDecision.value;

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
        t.set(adminDb.doc(`manual_credit_ledger/${reqId}`), {
          operationId: reqId,
          garageId: targetGarageId,
          amount,
          previousBalance,
          newBalance,
          source: 'approved_recharge_request',
          externalReference: requestData.externalReference || requestData.transferReference || null,
          approvedBy: callerUid || 'admin',
          idempotencyKey,
          createdAt: new Date()
        });

        resultData = { requestId: reqId, status: 'approved', amount, previousBalance, newBalance };
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
        return;
      }

      // System config for subscriber flat fee & commissions
      const settingsSnap = await t.get(adminDb.doc('system_config/global'));
      const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};
      const subscriberFlatFee = systemConfig?.subscriberFlatFee !== undefined
        ? Math.max(0, Number(systemConfig.subscriberFlatFee))
        : (systemConfig?.monthlySubscribersFlatFee !== undefined ? Number(systemConfig.monthlySubscribersFlatFee) : 500);

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

      const referrerGarageId = garageData.referredByGarageId;
      let referrerRef: any = null;
      let referrerSnap: any = null;
      const isEligibleForReferral = Boolean(referrerGarageId) && referrerGarageId !== targetGarageId && durationDays >= 15;
      if (isEligibleForReferral && referrerGarageId) {
        referrerRef = adminDb.doc(`garages/${referrerGarageId}`);
        referrerSnap = await t.get(referrerRef);
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

        if (!alreadyPaid && (durationDays >= 10 || newDaysPurchased >= 10)) {
          commission = 100;
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

      if (isEligibleForReferral && referrerRef && referrerSnap && referrerSnap.exists) {
        const referrerData = referrerSnap.data() || {};
        let refBaseDate = new Date();
        if (referrerData.balanceExpiry) {
          const rawExp = referrerData.balanceExpiry;
          const refExpDate = new Date(rawExp.toDate ? rawExp.toDate() : rawExp);
          if (!isNaN(refExpDate.getTime()) && refExpDate.getTime() > refBaseDate.getTime()) {
            refBaseDate = refExpDate;
          }
        }
        refBaseDate.setDate(refBaseDate.getDate() + 1);

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
          plateNumber: `🎉 مكافأة إحالة تلقائية: تمديد الاشتراك +1 يوم مجاناً لإحالة ${requestData.garageName || garageData.name || ''}`,
          timestamp: new Date(),
          amount: 0,
          packageId: 'referral_reward',
          details: { type: 'referral_reward', referrerGarageId, referredGarageId: targetGarageId, rewardDaysGiven: 1 }
        });
      }

      resultData = {
        requestId: reqId,
        status: 'approved',
        newExpiry: baseDate.toISOString(),
        revenue: effectiveRevenue,
        commission
      };

      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
    });

    return res.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Server Transaction] Error in approve-recharge-request:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});

// Secure Server API: Reject Recharge Request
requestApprovalRouter.post('/reject-recharge-request', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
  if (req.user?.role !== 'admin') {
    return sendApiError(res, 403, 'FORBIDDEN', 'ADMIN_ONLY', req.correlationId);
  }
  const callerUid = req.user?.uid;
  try {
    const sanitized = sanitizePayload(req.body, ['requestId', 'idempotencyKey'], false);
    const requestId = validateId(sanitized.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers['idempotency-key']);
    if (!idempotencyKey) return sendApiError(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED', req.correlationId);

    if (!adminDb) {
      return sendApiError(res, 500, 'INTERNAL_ERROR', 'ADMIN_SDK_NOT_INITIALIZED', req.correlationId);
    }

    await adminDb.runTransaction(async (t: any) => {
      const requestRef = adminDb.doc(`recharge_requests/${requestId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) {
        throw new Error('REQUEST_NOT_FOUND');
      }

      const requestData = requestSnap.data() || {};
      const requestFingerprint = createRequestFingerprint({
        requestId,
        garageId: requestData.garageId || null,
        requestType: requestData.requestType || null,
        amount: requestData.amount ?? requestData.revenueAmount ?? requestData.price ?? null,
        packageId: requestData.packageId || null,
      });
      const { isDuplicate } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/reject-recharge-request', callerUid, requestFingerprint);
      if (isDuplicate) return;

      const currentStatus = requestData.status;
      if (currentStatus && currentStatus !== 'pending') {
        throw new Error('REQUEST_ALREADY_PROCESSED');
      }

      t.set(requestRef, {
        status: 'rejected',
        resolvedAt: new Date()
      }, { merge: true });

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

      storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/transactions/reject-recharge-request', callerUid, requestFingerprint);
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Server Transaction] Error in reject-recharge-request:', error);
    const { statusCode, code, message } = mapDomainErrorToStatus(error);
    return sendApiError(res, statusCode, code, message, req.correlationId);
  }
});
