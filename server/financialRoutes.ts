import type { WorkerApp, WorkerUser } from './cloudflareWorker';

export type FinancialRouteDependency = (...args: any[]) => any;

export interface FinancialRouteDeps {
  getAdminDb: () => any;
  requireWorkerAuth: FinancialRouteDependency;
  enforceWorkerFinancialRateLimit: FinancialRouteDependency;
  sanitizePayload: FinancialRouteDependency;
  ValidationError: new (...args: any[]) => any;
  validateId: FinancialRouteDependency;
  validateString: FinancialRouteDependency;
  validateNumber: FinancialRouteDependency;
  validateIdempotencyKey: FinancialRouteDependency;
  checkIdempotencyInTransaction: FinancialRouteDependency;
  createRequestFingerprint: FinancialRouteDependency;
  storeIdempotencyInTransaction: FinancialRouteDependency;
  recordDomainEventInTransaction: FinancialRouteDependency;
  mapDomainErrorToStatus: FinancialRouteDependency;
  decideManualCredit: FinancialRouteDependency;
  validatePackageCatalogRecord: FinancialRouteDependency;
  decideReferralReward: FinancialRouteDependency;
  applyReferralReward: FinancialRouteDependency;
  extendSubscriptionExpiry: FinancialRouteDependency;
  initializeFairUse: FinancialRouteDependency;
  invalidateMaintainedAdminSummary: FinancialRouteDependency;
  parseFirestorePageRequest: FinancialRouteDependency;
  firestorePageStartAfter: FinancialRouteDependency;
  buildFirestorePage: FinancialRouteDependency;
  readWorkerFirestorePage: FinancialRouteDependency;
  sanitizeDelegateDoc: FinancialRouteDependency;
  canViewFinancialReport: FinancialRouteDependency;
  addFinancialReportCreditLedgerEntry: FinancialRouteDependency;
  addFinancialReportEvent: FinancialRouteDependency;
  addFinancialReportSettlement: FinancialRouteDependency;
  createFinancialReportAccumulator: FinancialRouteDependency;
  finishFinancialReport: FinancialRouteDependency;
}

export function registerFinancialRoutes(app: WorkerApp, deps: FinancialRouteDeps): void {
  const {
    getAdminDb,
    requireWorkerAuth,
    enforceWorkerFinancialRateLimit,
    sanitizePayload,
    ValidationError,
    validateId,
    validateString,
    validateNumber,
    validateIdempotencyKey,
    checkIdempotencyInTransaction,
    createRequestFingerprint,
    storeIdempotencyInTransaction,
    recordDomainEventInTransaction,
    mapDomainErrorToStatus,
    decideManualCredit,
    validatePackageCatalogRecord,
    decideReferralReward,
    applyReferralReward,
    extendSubscriptionExpiry,
    initializeFairUse,
    invalidateMaintainedAdminSummary,
    parseFirestorePageRequest,
    firestorePageStartAfter,
    buildFirestorePage,
    readWorkerFirestorePage,
    sanitizeDelegateDoc,
    canViewFinancialReport,
    addFinancialReportCreditLedgerEntry,
    addFinancialReportEvent,
    addFinancialReportSettlement,
    createFinancialReportAccumulator,
    finishFinancialReport
  } = deps;
// 9. Financial Transactions, Recharge Requests, Delegate Commissions & Reporting (CF7)

// Handler 1: Create Recharge Request (POST /api/recharge-requests/create & POST /api/recharge-requests)
const handleCreateRechargeRequest = async (c: any) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
  try {
    const user = c.get('user') as WorkerUser | undefined;
    if (user?.role !== 'garage' && user?.role !== 'delegate') {
      return c.json({ success: false, error: 'FORBIDDEN: Garage owner or delegate required' }, 403);
    }

    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['garageId', 'packageId', 'requestType', 'amount', 'couponCode', 'idempotencyKey'], false);
    const validatedGarageId = validateId(sanitized.garageId, 'garageId', true);
    const rawRequestType = sanitized.requestType === undefined
      ? 'subscription'
      : validateString(sanitized.requestType, 'requestType', { required: true, allowEmptyString: false });
    const requestType = rawRequestType === 'package_purchase' ? 'subscription' : rawRequestType;
    if (requestType !== 'subscription' && requestType !== 'balance_topup') {
      throw new ValidationError('Invalid requestType', 'INVALID_REQUEST_TYPE', 400);
    }

    const packageId = sanitized.packageId === undefined || sanitized.packageId === null || sanitized.packageId === ''
      ? null
      : validateId(sanitized.packageId, 'packageId', true);
    if (requestType === 'subscription' && !packageId) {
      return c.json({ success: false, error: 'PACKAGE_REQUIRED' }, 400);
    }
    const couponCode = validateString(sanitized.couponCode, 'couponCode', { max: 256 }) || null;
    const amount = requestType === 'balance_topup'
      ? validateNumber(sanitized.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true })
      : undefined;
    const idempotencyKey = validateIdempotencyKey(
      sanitized.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key')
    );
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const callerUid = user.uid;
    const delegateId = user.role === 'delegate' ? user.entityId || callerUid : null;
    const requestFingerprint = createRequestFingerprint({
      requestType,
      garageId: validatedGarageId,
      packageId,
      couponCode,
      amount: amount ?? null
    });
    const requestRef = getAdminDb().collection('recharge_requests').doc();
    const result = await getAdminDb().runTransaction(async (t: any) => {
      const garageRef = getAdminDb().doc(`garages/${validatedGarageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garageData = garageSnap.data() || {};

      if (user.role === 'garage' && user.garageId !== validatedGarageId) {
        throw new Error('GARAGE_SCOPE_MISMATCH');
      }
      if (user.role === 'delegate') {
        const canRequest = garageData.createdByDelegateId === delegateId || garageData.referrerId === delegateId;
        if (!canRequest) throw new Error('GARAGE_SCOPE_MISMATCH');
      }

      const duplicate = await checkIdempotencyInTransaction(
        t,
        idempotencyKey,
        '/api/recharge-requests/create',
        callerUid,
        requestFingerprint
      );
      if (duplicate.isDuplicate) {
        return duplicate.cachedResult || null;
      }

      const pendingGuardRef = getAdminDb().doc(`recharge_request_guards/${validatedGarageId}`);
      const pendingGuardSnap = await t.get(pendingGuardRef);
      const pendingGuard = pendingGuardSnap.exists ? pendingGuardSnap.data() || {} : {};
      if (typeof pendingGuard.activeRequestId === 'string' && pendingGuard.activeRequestId) {
        const activeRequestSnap = await t.get(getAdminDb().doc(`recharge_requests/${pendingGuard.activeRequestId}`));
        if (activeRequestSnap.exists && activeRequestSnap.data()?.status === 'pending') {
          throw new Error('PENDING_RECHARGE_REQUEST_EXISTS');
        }
      }
      if (pendingGuard.initialized !== true) {
        const existingRequests = await t.get(
          getAdminDb().collection('recharge_requests').where('garageId', '==', validatedGarageId)
        );
        if (existingRequests.docs.some((doc: any) => doc.data()?.status === 'pending')) {
          throw new Error('PENDING_RECHARGE_REQUEST_EXISTS');
        }
      }

      const requestData: Record<string, any> = {
        requestId: requestRef.id,
        garageId: validatedGarageId,
        packageId,
        requestType,
        couponCode,
        createdByUid: callerUid,
        requestedByUid: callerUid,
        requestedByRole: user.role,
        idempotencyKey,
        status: 'pending',
        createdAt: new Date()
      };
      if (amount !== undefined) requestData.amount = amount;
      if (user.role === 'delegate') {
        requestData.delegateId = delegateId;
        requestData.delegateName = user.displayName || 'مندوب';
        requestData.garageName = garageData.name || null;
      }

      const createdResult = { id: requestRef.id, data: requestData };
      t.set(pendingGuardRef, {
        garageId: validatedGarageId,
        initialized: true,
        activeRequestId: requestRef.id,
        updatedAt: new Date()
      }, { merge: true });
      t.set(requestRef, requestData);
      storeIdempotencyInTransaction(
        t,
        idempotencyKey,
        createdResult,
        '/api/recharge-requests/create',
        callerUid,
        requestFingerprint
      );
      return createdResult;
    });

    if (!result) return c.json({ success: false, error: 'IDEMPOTENCY_RESULT_UNAVAILABLE' }, 500);
    return c.json({ success: true, id: result.id, data: result.data });
  } catch (err: any) {
    console.error('[Worker] Error creating recharge request:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

app.post('/api/recharge-requests/create', requireWorkerAuth, enforceWorkerFinancialRateLimit, handleCreateRechargeRequest);
app.post('/api/recharge-requests', requireWorkerAuth, enforceWorkerFinancialRateLimit, handleCreateRechargeRequest);

// Handler 2: Process/Approve Recharge Request (POST /api/recharge-requests/process & POST /api/transactions/approve-recharge-request)
const handleApproveRechargeRequest = async (c: any) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
  }
  const callerUid = user?.uid;
  try {
    const body = await c.req.json().catch(() => ({}));
    const reqId = validateId(body.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let resultData: any = null;

    await getAdminDb().runTransaction(async (t: any) => {
      const requestRef = getAdminDb().doc(`recharge_requests/${reqId}`);
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
        durationDays: requestData.durationDays ?? requestData.vehiclesCount ?? null
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
      const pendingGuardRef = getAdminDb().doc(`recharge_request_guards/${targetGarageId}`);
      const pendingGuardSnap = await t.get(pendingGuardRef);
      const pendingGuard = pendingGuardSnap.exists ? pendingGuardSnap.data() || {} : {};
      const garageRef = getAdminDb().doc(`garages/${targetGarageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) {
        throw new Error('GARAGE_NOT_FOUND');
      }

      const garageData = garageSnap.data() || {};

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
        if (pendingGuard.activeRequestId === reqId) {
          t.set(pendingGuardRef, { activeRequestId: null, updatedAt: new Date() }, { merge: true });
        }

        const logRef = getAdminDb().collection('activity_logs').doc();
        t.set(logRef, {
          garageId: targetGarageId,
          garageName: garageData.name || '',
          staffId: callerUid || 'admin',
          staffName: 'مدير النظام (Admin)',
          actionType: 'balance_topup',
          plateNumber: `اعتماد شحن رصيد (${amount} ج.م)`,
          timestamp: new Date(),
          amount,
          details: { action: 'approved_balance_topup', requestId: reqId, previousBalance, newBalance }
        });

        t.set(getAdminDb().doc(`manual_credit_ledger/${reqId}`), {
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

        recordDomainEventInTransaction(t, getAdminDb(), {
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
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
        return;
      }

      const settingsSnap = await t.get(getAdminDb().doc('system_config/global'));
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
      let isUnlimitedPkg = false;
      let effCapacity = 40;

      if (requestData.packageId) {
        const pkgRef = getAdminDb().doc(`packages/${requestData.packageId}`);
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
        delegateRef = getAdminDb().doc(`delegates/${targetDelegateId}`);
        delegateSnap = await t.get(delegateRef);
      }

      const referrerGarageId = garageData.referredByGarageId;
      let referrerRef: any = null;
      let referrerSnap: any = null;
      const isEligibleForReferral = decideReferralReward({ referrerGarageId, targetGarageId, durationDays }).eligible;
      if (isEligibleForReferral && referrerGarageId) {
        referrerRef = getAdminDb().doc(`garages/${referrerGarageId}`);
        referrerSnap = await t.get(referrerRef);
      }

      let commission = 0;
      if (referredByDelegate && targetDelegateId) {
        const currentMonthKey = new Date().toISOString().slice(0, 7);
        const monthlyStatsRef = getAdminDb().doc(`garage_monthly_stats/${targetGarageId}_${currentMonthKey}`);
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

      const baseDate = extendSubscriptionExpiry(garageData.balanceExpiry, durationDays);

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
      invalidateMaintainedAdminSummary(t);

      t.set(requestRef, {
        status: 'approved',
        commission,
        referrerId: delegateReferrerId,
        amount: effectiveRevenue,
        revenueAmount: effectiveRevenue,
        originalRevenueAmount: effectiveOriginalRevenue,
        resolvedAt: new Date()
      }, { merge: true });
      if (pendingGuard.activeRequestId === reqId) {
        t.set(pendingGuardRef, { activeRequestId: null, updatedAt: new Date() }, { merge: true });
      }

      if (delegateRef && delegateSnap && delegateSnap.exists) {
        const delData = delegateSnap.data() || {};
        t.set(delegateRef, {
          totalRechargedAmount: (delData.totalRechargedAmount || 0) + effectiveRevenue,
          totalCommissionEarned: (delData.totalCommissionEarned || 0) + commission
        }, { merge: true });
      }

      const logRef = getAdminDb().collection('activity_logs').doc();
      t.set(logRef, {
        garageId: targetGarageId,
        garageName: requestData.garageName || garageData.name || '',
        staffId: delegateReferrerId || requestData.delegateId || null,
        staffName: requestData.delegateName || null,
        actionType: 'recharge',
        plateNumber: `شحن ${requestData.packageName || 'الباقة'} (${durationDays} يوم)`,
        timestamp: new Date(),
        amount: effectiveRevenue,
        packageId: requestData.packageId || null
      });

      recordDomainEventInTransaction(t, getAdminDb(), {
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
        recordDomainEventInTransaction(t, getAdminDb(), {
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
        const refBaseDate = applyReferralReward(referrerData.balanceExpiry, 1);

        t.set(referrerRef, {
          balanceExpiry: refBaseDate,
          totalGaragesReferredCount: (referrerData.totalGaragesReferredCount || 0) + 1,
          lastReferralRewardAt: new Date()
        }, { merge: true });

        const rewardLogRef = getAdminDb().collection('activity_logs').doc();
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

      resultData = { requestId: reqId, status: 'approved', newExpiry: baseDate.toISOString(), revenue: effectiveRevenue, commission };
      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/approve-recharge-request', callerUid, requestFingerprint);
    });

    return c.json({ success: true, data: resultData });
  } catch (error: any) {
    console.error('[Worker] Error in approve recharge request:', error);
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

app.post('/api/recharge-requests/process', requireWorkerAuth, handleApproveRechargeRequest);
app.post('/api/transactions/approve-recharge-request', requireWorkerAuth, handleApproveRechargeRequest);

// Handler 3: Reject Recharge Request (POST /api/recharge-requests/reject & POST /api/transactions/reject-recharge-request)
const handleRejectRechargeRequest = async (c: any) => {
  const user = c.get('user');
  if (user?.role !== 'admin') {
    return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
  }
  const callerUid = user?.uid;
  try {
    const body = await c.req.json().catch(() => ({}));
    const requestId = validateId(body.requestId, 'requestId', true);
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    await getAdminDb().runTransaction(async (t: any) => {
      const requestRef = getAdminDb().doc(`recharge_requests/${requestId}`);
      const requestSnap = await t.get(requestRef);
      if (!requestSnap.exists) throw new Error('REQUEST_NOT_FOUND');

      const requestData = requestSnap.data() || {};
      const requestFingerprint = createRequestFingerprint({ requestId, garageId: requestData.garageId || null });
      const { isDuplicate } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/reject-recharge-request', callerUid, requestFingerprint);
      if (isDuplicate) return;

      if (requestData.status && requestData.status !== 'pending') {
        throw new Error('REQUEST_ALREADY_PROCESSED');
      }

      const targetGarageId = validateId(requestData.garageId, 'garageId', true);
      const pendingGuardRef = getAdminDb().doc(`recharge_request_guards/${targetGarageId}`);
      const pendingGuardSnap = await t.get(pendingGuardRef);
      const pendingGuard = pendingGuardSnap.exists ? pendingGuardSnap.data() || {} : {};

      t.set(requestRef, { status: 'rejected', resolvedAt: new Date() }, { merge: true });
      if (pendingGuard.activeRequestId === requestId) {
        t.set(pendingGuardRef, { activeRequestId: null, updatedAt: new Date() }, { merge: true });
      }

      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId: validateId(requestData.garageId, 'garageId', true),
        aggregateType: 'recharge',
        aggregateId: requestId,
        eventType: 'recharge_rejected',
        actorUid: callerUid || 'system',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        payload: { requestId, rejectedAt: new Date().toISOString() }
      });

      storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, '/api/transactions/reject-recharge-request', callerUid, requestFingerprint);
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Worker] Error in reject recharge request:', error);
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
};

app.post('/api/recharge-requests/reject', requireWorkerAuth, handleRejectRechargeRequest);
app.post('/api/transactions/reject-recharge-request', requireWorkerAuth, handleRejectRechargeRequest);

// Handler 4 & 5: Query Recharge Requests (GET /api/recharge-requests & GET /api/recharge-requests/my)
app.get('/api/recharge-requests', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const status = c.req.query('status');
    if (status && !['pending', 'approved', 'rejected'].includes(status)) return c.json({ success: false, error: 'INVALID_STATUS' }, 400);
    let pageRequest;
    try {
      pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), `recharge-requests:admin:${status || 'all'}`);
    } catch (error: any) {
      return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
    }
    const requestsCollection = getAdminDb().collection('recharge_requests');
    let requestsQuery: any = requestsCollection;
    if (status) requestsQuery = requestsQuery.where('status', '==', status);
    requestsQuery = requestsQuery.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    requestsQuery = firestorePageStartAfter(requestsQuery, requestsCollection, pageRequest.cursor);
    const requestsSnapshot = await requestsQuery.limit(pageRequest.pageSize + 1).get();
    const requestPage = buildFirestorePage(requestsSnapshot.docs, pageRequest, 'createdAt');
    const requests = requestPage.documents.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return c.json({ success: true, requests, items: requests, hasMore: requestPage.hasMore, nextCursor: requestPage.nextCursor });
  } catch (err: any) {
    console.error('[Worker] Error fetching recharge requests:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

app.get('/api/recharge-requests/my', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const garageId = user?.garageId || user?.entityId;
    const delegateId = user?.role === 'delegate' ? (user?.entityId || user?.uid) : null;

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let query: any;
    let scope: string;
    if (delegateId) {
      query = getAdminDb().collection('recharge_requests').where('delegateId', '==', delegateId);
      scope = `recharge-requests:delegate:${delegateId}`;
    } else if (garageId) {
      query = getAdminDb().collection('recharge_requests').where('garageId', '==', garageId);
      scope = `recharge-requests:garage:${garageId}`;
    } else {
      return c.json({ success: true, requests: [], items: [], hasMore: false, nextCursor: null });
    }

    let pageRequest;
    try {
      pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), scope);
    } catch (error: any) {
      return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
    }
    const requestsCollection = getAdminDb().collection('recharge_requests');
    query = query.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    query = firestorePageStartAfter(query, requestsCollection, pageRequest.cursor);
    const snap = await query.limit(pageRequest.pageSize + 1).get();
    const requestPage = buildFirestorePage(snap.docs, pageRequest, 'createdAt');
    const requests = requestPage.documents.map((doc: any) => ({ id: doc.id, ...doc.data() }));

    return c.json({ success: true, requests, items: requests, hasMore: requestPage.hasMore, nextCursor: requestPage.nextCursor });
  } catch (err: any) {
    console.error('[Worker] Error fetching my recharge requests:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Handler 6: Direct Balance Top-Up (POST /api/transactions/admin-topup-balance)
app.post('/api/transactions/admin-topup-balance', requireWorkerAuth, async (c) => {
  return c.json({ success: false, error: 'LEGACY_BILLING_MODEL_RETIRED' }, 410);
  const user = c.get('user');
  if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
  const callerUid = user?.uid;
  try {
    const body = await c.req.json().catch(() => ({}));
    const garageId = validateId(body.garageId, 'garageId', true);
    const numAmount = validateNumber(body.amount, 'amount', { min: 1, max: 1_000_000, integerOnly: true });
    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let resultData: any = null;

    await getAdminDb().runTransaction(async (t: any) => {
      const requestFingerprint = createRequestFingerprint({ garageId, amount: numAmount });
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/transactions/admin-topup-balance', callerUid, requestFingerprint);
      if (isDuplicate) {
        resultData = cachedResult;
        return;
      }

      const garageRef = getAdminDb().doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');

      const garageData = garageSnap.data() || {};
      const creditDecision = decideManualCredit({ amount: numAmount, previousBalance: Number(garageData.balance || 0) });
      if (creditDecision.ok === false) throw new Error(creditDecision.error);
      const { previousBalance, newBalance } = creditDecision.value;

      t.set(garageRef, {
        balance: newBalance,
        totalAdminRevenue: (garageData.totalAdminRevenue || 0) + numAmount,
        lastRechargeDate: new Date(),
        lastRechargeAmount: numAmount,
        lastRechargePackageName: `شحن رصيد مباشر (${numAmount} ج.م)`
      }, { merge: true });
      invalidateMaintainedAdminSummary(t);

      const logRef = getAdminDb().collection('activity_logs').doc();
      t.set(logRef, {
        garageId,
        garageName: garageData.name || '',
        staffId: callerUid || 'admin',
        staffName: 'مدير النظام (Admin)',
        actionType: 'balance_topup',
        plateNumber: `شحن رصيد مباشر (${numAmount} ج.م)`,
        timestamp: new Date(),
        amount: numAmount
      });

      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId,
        aggregateType: 'wallet',
        aggregateId: garageId,
        eventType: 'wallet_topup_approved',
        actorUid: callerUid || 'admin',
        actorRole: 'admin',
        idempotencyKey,
        payload: { amount: numAmount, previousBalance, newBalance, source: 'admin_direct_topup' }
      });

      t.set(getAdminDb().doc(`manual_credit_ledger/${createRequestFingerprint({ garageId, amount: numAmount, idempotencyKey })}`), {
        operationId: idempotencyKey,
        garageId,
        amount: numAmount,
        previousBalance,
        newBalance,
        source: 'admin_direct_topup',
        approvedBy: callerUid || 'admin',
        idempotencyKey,
        createdAt: new Date()
      });

      resultData = { garageId, newBalance, addedAmount: numAmount };
      storeIdempotencyInTransaction(t, idempotencyKey, resultData, '/api/transactions/admin-topup-balance', callerUid, requestFingerprint);
    });

    return c.json({ success: true, data: resultData });
  } catch (err: any) {
    console.error('[Worker] Error in admin balance top-up:', err);
    const { statusCode, message } = mapDomainErrorToStatus(err);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Handler 7: Delegate Commission Earnings & Dashboard (GET /api/delegate/commission-earnings & GET /api/delegates/dashboard)
const handleDelegateDashboard = async (c: any) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'delegate' || !user.entityId || !getAdminDb()) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }

    const delegateId = user.entityId;
    const delegateRef = getAdminDb().collection('delegates').doc(delegateId);
    const delegateSnap = await delegateRef.get();
    if (!delegateSnap.exists) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);

    const garagesCollection = getAdminDb().collection('garages');
    const requestsCollection = getAdminDb().collection('recharge_requests');
    const childQuery = (name: string) => name === 'createdGarages'
      ? garagesCollection.where('createdByDelegateId', '==', delegateId)
      : name === 'referredGarages'
        ? garagesCollection.where('referrerId', '==', delegateId)
        : requestsCollection.where('delegateId', '==', delegateId);
    const allowedSections = ['createdGarages', 'referredGarages', 'requests'];
    const readChildPage = async (name: string, cursor?: string) => {
      const collection = name === 'requests' ? requestsCollection : garagesCollection;
      const pageRequest = parseFirestorePageRequest(c.req.query('limit'), cursor, `delegate-dashboard:${delegateId}:${name}`);
      return readWorkerFirestorePage(childQuery(name), collection, pageRequest);
    };
    try {
      const section = c.req.query('section');
      if (section && section !== 'all') {
        if (!allowedSections.includes(section)) return c.json({ success: false, error: 'INVALID_PAGE_SECTION' }, 400);
        const page = await readChildPage(section, c.req.query('cursor'));
        const items = page.documents.map((doc: any) => section === 'requests'
          ? ({ id: doc.id, ...doc.data() })
          : sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));
        return c.json({
          success: true,
          delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
          ...(section === 'requests' ? { requests: items } : { garages: items }),
          items, hasMore: page.hasMore, nextCursor: page.nextCursor,
          pagination: { [section]: { hasMore: page.hasMore, nextCursor: page.nextCursor } }
        });
      }

      const [createdPage, referredPage, requestPage] = await Promise.all([
        readChildPage('createdGarages', c.req.query('createdGaragesCursor')),
        readChildPage('referredGarages', c.req.query('referredGaragesCursor')),
        readChildPage('requests', c.req.query('requestsCursor'))
      ]);
      const garagesById = new Map<string, any>();
      for (const doc of [...createdPage.documents, ...referredPage.documents]) {
        garagesById.set(doc.id, sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));
      }
      const garages = Array.from(garagesById.values());
      const requests = requestPage.documents.map((doc: any) => ({ id: doc.id, ...doc.data() }));

      return c.json({
        success: true,
        delegate: sanitizeDelegateDoc({ id: delegateSnap.id, ...delegateSnap.data() }),
        garages,
        requests,
        pagination: {
          createdGarages: { hasMore: createdPage.hasMore, nextCursor: createdPage.nextCursor },
          referredGarages: { hasMore: referredPage.hasMore, nextCursor: referredPage.nextCursor },
          requests: { hasMore: requestPage.hasMore, nextCursor: requestPage.nextCursor }
        }
      });
    } catch (error: any) {
      if (error?.message === 'INVALID_PAGE_SIZE' || error?.message === 'INVALID_PAGE_CURSOR') {
        return c.json({ success: false, error: error.message }, 400);
      }
      throw error;
    }
  } catch (err: any) {
    console.error('[Worker Delegate] Error loading dashboard:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
};

app.get('/api/delegate/commission-earnings', requireWorkerAuth, handleDelegateDashboard);
app.get('/api/delegates/dashboard', requireWorkerAuth, handleDelegateDashboard);

// Handler 8: Settle Delegate Commission / Withdrawal (POST /api/delegate/withdraw-commission & POST /api/delegates/settle-account)
const handleSettleDelegateAccount = async (c: any) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const id = body.id || body.delegateId;
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const idempotencyKey = validateIdempotencyKey(body.idempotencyKey || c.req.header('x-idempotency-key') || c.req.header('idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    const requestFingerprint = createRequestFingerprint({ id });
    const delRef = getAdminDb().collection('delegates').doc(id);
    const now = new Date();
    let previousTotal = 0;
    let settlementId = '';
    let duplicateResult: any = null;

    await getAdminDb().runTransaction(async (t: any) => {
      if (idempotencyKey) {
        const duplicate = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/delegates/settle-account', user?.uid, requestFingerprint);
        if (duplicate.isDuplicate) {
          duplicateResult = duplicate.cachedResult;
          return;
        }
      }
      const snap = await t.get(delRef);
      if (!snap.exists) throw new Error('DELEGATE_NOT_FOUND');
      const data = snap.data() || {};
      previousTotal = Number(data.totalRechargedAmount || 0);
      if (!Number.isFinite(previousTotal) || previousTotal <= 0) {
        throw new Error('NO_UNSETTLED_COMMISSION');
      }
      const settlementRef = getAdminDb().collection('settlements').doc();
      settlementId = settlementRef.id;
      t.set(settlementRef, {
        settlementId,
        delegateId: id,
        cutoffTime: now,
        previousCycleTotal: previousTotal,
        settledByUid: user?.uid || 'admin',
        settledAt: now,
        idempotencyKey: idempotencyKey || null,
        createdAt: now
      });
      t.update(delRef, {
        lastSettledAt: now,
        totalRechargedAmount: 0,
        updatedAt: now
      });
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId: 'global',
        aggregateType: 'delegate',
        aggregateId: id,
        eventType: 'delegate_settled',
        actorUid: user?.uid || 'admin',
        actorRole: 'admin',
        idempotencyKey: idempotencyKey || undefined,
        eventCollectionPath: `delegates/${id}/events`,
        payload: {
          delegateId: id,
          settlementId,
          previousRechargedAmount: previousTotal,
          settledAt: now.toISOString()
        }
      });
      if (idempotencyKey) {
        storeIdempotencyInTransaction(
          t,
          idempotencyKey,
          { success: true, settlementId, settledAt: now.toISOString(), previousRechargedAmount: previousTotal },
          '/api/delegates/settle-account',
          user?.uid,
          requestFingerprint
        );
      }
    });

    if (duplicateResult) return c.json(duplicateResult);
    return c.json({ success: true, settlementId, settledAt: now.toISOString(), previousRechargedAmount: previousTotal });
  } catch (err: any) {
    console.error('[Worker Delegate] Error settling account:', err);
    if (err?.message === 'NO_UNSETTLED_COMMISSION') {
      return c.json({ success: false, error: 'NO_UNSETTLED_COMMISSION' }, 409);
    }
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
};

app.post('/api/delegate/withdraw-commission', requireWorkerAuth, handleSettleDelegateAccount);
app.post('/api/delegates/settle-account', requireWorkerAuth, handleSettleDelegateAccount);

// Handler 9: Financial Summary Report (GET /api/financial-summary & GET /api/reports/financial)
const handleFinancialSummaryReport = async (c: any) => {
  try {
    const user = c.get('user');
    if (!canViewFinancialReport(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const requestedStart = c.req.query('start');
    const requestedEnd = c.req.query('end');
    const delegateId = c.req.query('delegateId') ? validateId(c.req.query('delegateId'), 'delegateId', true) : undefined;

    const isStrictDateOnly = (value?: string) => {
      if (value === undefined) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!isStrictDateOnly(requestedStart) || !isStrictDateOnly(requestedEnd)) {
      return c.json({ success: false, code: 'INVALID_REPORT_DATE', error: 'INVALID_REPORT_DATE', statusCode: 400 }, 400);
    }

    if (requestedStart && requestedEnd && new Date(requestedStart) >= new Date(requestedEnd)) {
      return c.json({ success: false, code: 'START_MUST_PRECEDE_END', error: 'START_MUST_PRECEDE_END', statusCode: 400 }, 400);
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const defaultEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const subtractOneCalendarYear = (date: Date) => {
      const year = date.getUTCFullYear() - 1;
      const month = date.getUTCMonth();
      const day = Math.min(date.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
      return new Date(Date.UTC(year, month, day));
    };
    // No-date reports default to the latest 12 calendar months. Partial ranges
    // are bounded too; older history remains available through explicit dates.
    const start = requestedStart || subtractOneCalendarYear(requestedEnd ? new Date(`${requestedEnd}T00:00:00.000Z`) : today).toISOString().slice(0, 10);
    const end = requestedEnd || defaultEnd.toISOString().slice(0, 10);
    if (new Date(start) >= new Date(end)) {
      return c.json({ success: false, code: 'START_MUST_PRECEDE_END', error: 'START_MUST_PRECEDE_END', statusCode: 400 }, 400);
    }
    // Apply inclusive-start/exclusive-end boundaries in Firestore and process
    // stable cursor pages so Worker memory is independent of ledger history.
    const startAt = new Date(`${start}T00:00:00.000Z`);
    const endAt = new Date(`${end}T00:00:00.000Z`);
    // Domain events persist occurredAt as an ISO string, unlike settlement
    // records, whose settledAt field is a Firestore Timestamp/Date.
    const eventStartAt = startAt.toISOString();
    const eventEndAt = endAt.toISOString();
    let eventsQuery: any = getAdminDb().collectionGroup('events');
    let settlementsQuery: any = getAdminDb().collection('settlements');
    let creditLedgerQuery: any = getAdminDb().collection('credit_ledger');
    eventsQuery = eventsQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    settlementsQuery = settlementsQuery.where('settledAt', '>=', startAt).where('settledAt', '<', endAt);
    if (!delegateId) creditLedgerQuery = creditLedgerQuery.where('occurredAt', '>=', eventStartAt).where('occurredAt', '<', eventEndAt);
    const accumulator = createFinancialReportAccumulator({ start, end, delegateId });
    const pageSize = 250;
    const forEachPage = async (baseQuery: any, timestampField: string, consume: (value: any) => void) => {
      let cursor: any = null;
      while (true) {
        let pageQuery = baseQuery.orderBy(timestampField, 'asc').orderBy('__name__', 'asc').limit(pageSize);
        if (cursor) pageQuery = pageQuery.startAfter(cursor.timestamp, cursor.ref);
        const page = await pageQuery.get();
        if (page.docs.length === 0) break;
        for (const document of page.docs) consume(document.data() || {});
        if (page.docs.length < pageSize) break;
        const last = page.docs[page.docs.length - 1];
        cursor = { timestamp: last.data()?.[timestampField], ref: last.ref };
      }
    };
    // Load settlement cutoffs before events; keep only totals and one latest
    // timestamp per delegate, never the underlying document arrays.
    await forEachPage(settlementsQuery, 'settledAt', (settlement) => addFinancialReportSettlement(accumulator, settlement));
    await forEachPage(eventsQuery, 'occurredAt', (event) => addFinancialReportEvent(accumulator, event));
    if (!delegateId) await forEachPage(creditLedgerQuery, 'occurredAt', (entry) => addFinancialReportCreditLedgerEntry(accumulator, entry));
    const report = finishFinancialReport(accumulator);

    return c.json({
      success: true,
      data: {
        report,
        filters: { start, end, delegateId: delegateId || null },
        generatedAt: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Worker Reports] Error generating financial report:', err);
    return c.json({ success: false, error: err?.message || 'REPORT_GENERATION_FAILED' }, 500);
  }
};

app.get('/api/financial-summary', requireWorkerAuth, handleFinancialSummaryReport);
app.get('/api/reports/financial', requireWorkerAuth, handleFinancialSummaryReport);

}
