import { Router } from 'express';
import { requireAuth, financialRateLimiter, AuthRequest, sendApiError } from '../../middleware';
import { adminDb } from '../../firebaseAdmin';
import { checkIdempotencyInTransaction, storeIdempotencyInTransaction, createRequestFingerprint } from '../../idempotency';
import { recordDomainEventInTransaction } from '../../events';
import { sanitizePayload, validateId, validateNumber, validateIdempotencyKey } from '../../validation';
import { mapDomainErrorToStatus } from '../helpers';
import { decideManualCredit } from '../../domain/manualCredit';

export const manualTopupRouter = Router();

// Secure Server API: Admin Direct Balance Top-Up
manualTopupRouter.post('/admin-topup-balance', requireAuth, financialRateLimiter(), async (req: AuthRequest, res: any) => {
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
      const creditDecision = decideManualCredit({ amount: numAmount, previousBalance: Number(garageData.balance || 0) });
      if (creditDecision.ok === false) throw new Error(creditDecision.error);
      const { previousBalance: currentBalance, newBalance } = creditDecision.value;

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
      t.set(adminDb.doc(`manual_credit_ledger/${createRequestFingerprint({ garageId, amount: numAmount, idempotencyKey })}`), {
        operationId: idempotencyKey,
        garageId,
        amount: numAmount,
        previousBalance: currentBalance,
        newBalance,
        source: 'admin_direct_topup',
        approvedBy: callerUid || 'admin',
        idempotencyKey,
        createdAt: new Date()
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
