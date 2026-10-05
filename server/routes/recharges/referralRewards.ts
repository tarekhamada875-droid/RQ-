import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest, sendApiError } from '../../middleware';
import { adminDb } from '../../firebaseAdmin';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction } from '../../idempotency';
import { sanitizePayload, validateId, validateIdempotencyKey } from '../../validation';
import { mapDomainErrorToStatus } from '../helpers';
import { extendSubscriptionExpiry } from '../../domain/subscriptionBilling';

export const referralRewardsRouter = Router();

// Secure Server API: Garage Referral Reward Claim
referralRewardsRouter.post('/use-referral-reward', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
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
      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, rewardDays);

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
