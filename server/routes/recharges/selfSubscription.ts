import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest, sendApiError } from '../../middleware';
import { adminDb } from '../../firebaseAdmin';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction, createRequestFingerprint } from '../../idempotency';
import { recordDomainEventInTransaction } from '../../events';
import { initializeFairUse } from '../../unlimitedFairUse';
import { sanitizePayload, validateId, validateIdempotencyKey } from '../../validation';
import { mapDomainErrorToStatus } from '../helpers';
import { validatePackageCatalogRecord } from '../../packageCatalog';
import { extendSubscriptionExpiry } from '../../domain/subscriptionBilling';

export const selfSubscriptionRouter = Router();

// Secure Server API: Garage Self-Service Subscription Using Balance
selfSubscriptionRouter.post('/garage-self-subscribe', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
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

      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, durationDays);

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
