import type { WorkerApp } from './cloudflareWorker';

export type GarageRouteDependency = (...args: any[]) => any;

export interface GarageRouteDeps {
  getAdminDb: () => any;
  getAdminAuth: () => any;
  requireWorkerAuth: GarageRouteDependency;
  enforceWorkerFinancialRateLimit: GarageRouteDependency;
  canSubmitGarageApplication: GarageRouteDependency;
  sanitizePayload: GarageRouteDependency;
  validateString: GarageRouteDependency;
  validateNumber: GarageRouteDependency;
  ValidationError: new (...args: any[]) => any;
  validateNewPin: GarageRouteDependency;
  validateIdempotencyKey: GarageRouteDependency;
  computeLookupHash: GarageRouteDependency;
  checkPinAvailabilityAcrossAll: GarageRouteDependency;
  createRequestFingerprint: GarageRouteDependency;
  checkIdempotencyInTransaction: GarageRouteDependency;
  saveEntityPinInTransaction: GarageRouteDependency;
  maintainedGarageSummaryRef: GarageRouteDependency;
  maintainedAdminSummaryRef: GarageRouteDependency;
  MAINTAINED_SUMMARY_VERSION: any;
  writeMaintainedAdminDelta: GarageRouteDependency;
  storeIdempotencyInTransaction: GarageRouteDependency;
  mapDomainErrorToStatus: GarageRouteDependency;
  parseMoneyAmount: GarageRouteDependency;
  parseFirestorePageRequest: GarageRouteDependency;
  firestorePageStartAfter: GarageRouteDependency;
  buildFirestorePage: GarageRouteDependency;
  canRunGarageMaintenance: GarageRouteDependency;
  validateId: GarageRouteDependency;
  getCairoDayBounds: GarageRouteDependency;
  reconcileGarageState: GarageRouteDependency;
  isValidDateKey: GarageRouteDependency;
  calculateDailyProjection: GarageRouteDependency;
  aggregateProjectionBuckets: GarageRouteDependency;
  reconcileDashboardSummary: GarageRouteDependency;
  decideGarageScope: GarageRouteDependency;
  isFreshDashboardSummary: GarageRouteDependency;
  normalizeStoredDashboardMoney: GarageRouteDependency;
  canManageStaffForGarage: GarageRouteDependency;
  deleteEntityPinInTransaction: GarageRouteDependency;
  canManageDelegates: GarageRouteDependency;
  saveEntityPin: GarageRouteDependency;
  canUpdateEntityPin: GarageRouteDependency;
  validatePackageCatalogRecord: GarageRouteDependency;
  grantPaidCredits: GarageRouteDependency;
  grantTrialCredits: GarageRouteDependency;
  awardReferralCredits: GarageRouteDependency;
  materializeCreditLedgerEntry: GarageRouteDependency;
  recordDomainEventInTransaction: GarageRouteDependency;
  startGarageDeletionRoute: GarageRouteDependency;
  advanceGarageDeletionRoute: GarageRouteDependency;
  readGarageDeletionStatusRoute: GarageRouteDependency;
}

export function registerGarageRoutes(app: WorkerApp, deps: GarageRouteDeps): void {
  const {
    getAdminDb,
    getAdminAuth,
    requireWorkerAuth,
    enforceWorkerFinancialRateLimit,
    canSubmitGarageApplication,
    sanitizePayload,
    validateString,
    validateNumber,
    ValidationError,
    validateNewPin,
    validateIdempotencyKey,
    computeLookupHash,
    checkPinAvailabilityAcrossAll,
    createRequestFingerprint,
    checkIdempotencyInTransaction,
    saveEntityPinInTransaction,
    maintainedGarageSummaryRef,
    maintainedAdminSummaryRef,
    MAINTAINED_SUMMARY_VERSION,
    writeMaintainedAdminDelta,
    storeIdempotencyInTransaction,
    mapDomainErrorToStatus,
    parseMoneyAmount,
    parseFirestorePageRequest,
    firestorePageStartAfter,
    buildFirestorePage,
    canRunGarageMaintenance,
    validateId,
    getCairoDayBounds,
    reconcileGarageState,
    isValidDateKey,
    calculateDailyProjection,
    aggregateProjectionBuckets,
    reconcileDashboardSummary,
    decideGarageScope,
    isFreshDashboardSummary,
    normalizeStoredDashboardMoney,
    canManageStaffForGarage,
    deleteEntityPinInTransaction,
    canManageDelegates,
    saveEntityPin,
    canUpdateEntityPin,
    validatePackageCatalogRecord,
    grantPaidCredits,
    grantTrialCredits,
    awardReferralCredits,
    materializeCreditLedgerEntry,
    recordDomainEventInTransaction,
    startGarageDeletionRoute,
    advanceGarageDeletionRoute,
    readGarageDeletionStatusRoute
  } = deps;
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
    const retiredCreationFields = ['billingModel', 'dailyCapacity', 'initialPackageId', 'packages'];
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

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

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
      await getAdminDb().runTransaction(async (t: any) => {
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
      const delegateGaragesToday = await getAdminDb().collection('garages')
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
    const isTrial = sanitized.isTrial === true || sanitized.isTrial === 'true' || sanitized.isTrial === 'on' || sanitized.isTrial === '1';
    const trialCreditAmount = isTrial ? 100 : 0;
    const finalDailyCapacity = 0;
    const activePackageName = '';
    const balanceExpiry = null;
    const garageRef = getAdminDb().collection('garages').doc();
    const garageId = garageRef.id;
    const logRef = getAdminDb().collection('activity_logs').doc();
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
      activePackageName,
      packageName: activePackageName,
      balanceExpiry,
      balance: 0,
      creditBalance: { paid: 0, referral: 0, trial: trialCreditAmount },
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
        packageName: activePackageName,
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

    await getAdminDb().runTransaction(async (t: any) => {
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
        delegateQuotaLockRef = getAdminDb().collection('delegate_garage_creation_quota_locks')
          .doc(`${encodeURIComponent(delegateEntityId)}_${delegateQuotaDateKey}`);
        // Same-day creations by this delegate share one transactional lock.
        // Firestore retries conflicts, re-running the quota query after a concurrent commit.
        await t.get(delegateQuotaLockRef);
        const { start: cairoDayStart, end: cairoNextDayStart } = getCairoDayBounds(delegateQuotaDateKey);
        const delegateGaragesToday = await t.get(getAdminDb().collection('garages')
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
          balance: { paid: 0, referral: 0, trial: 0 },
          amount: trialCreditAmount,
          garageId,
          actorUid: callerUid,
          actorRole: callerRole || 'system',
          reason: 'New garage trial credit grant',
          reference: garageId,
          occurredAt: now.toISOString(),
          idempotencyKey: `garage-create:${garageId}:trial`,
        });
        if (trialTransition.ok === false) throw new Error(trialTransition.error);
        const trialLedger = materializeCreditLedgerEntry(trialTransition.value.entry);
        if (trialLedger.ok === false) throw new Error(trialLedger.error);
        t.set(getAdminDb().doc(`credit_ledger/${trialLedger.value.entryId}`), {
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
        balanceExpiry,
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
app.post('/api/garages/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const { id, ...data } = body || {};
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const retiredUpdateFields = new Set([
      'billingModel', 'commissionPerVehicle', 'monthlySubscriptionFee', 'dailyCapacity', 'capacity', 'allowMonthlySubscribers',
      'activePackageName', 'packageName', 'balance', 'balanceExpiry', 'balanceDays', 'carsInside',
      'lastBalanceDeduction', 'lastPaidFriday', 'lastRechargeAmount', 'lastRechargeDate', 'lastRechargePackageName',
      'totalRechargedCars', 'referralBonusBalance', 'referralRewardClaimed', 'referralRewardAwardedAt'
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

    await getAdminDb().collection('garages').doc(id).update(updates);
    await maintainedAdminSummaryRef().set({ schemaVersion: MAINTAINED_SUMMARY_VERSION, summaryScope: 'admin', stale: true, updatedAt: new Date() }, { merge: true });
    return c.json({ success: true });
  } catch (err: any) {
    console.error('[Worker Garage] Error updating garage:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Garage deletion handlers live in a dedicated module; all three routes share the same server authority.
app.post('/api/garages/delete', requireWorkerAuth, startGarageDeletionRoute);
app.post('/api/garages/delete-step', requireWorkerAuth, advanceGarageDeletionRoute);
app.get('/api/garages/delete-status', requireWorkerAuth, readGarageDeletionStatusRoute);

// Handler 4 & 5: Query Garages (GET /api/garages & GET /api/garages/:id)
app.get('/api/garages', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!['admin', 'delegate'].includes(user?.role || '')) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const garagesCollection = getAdminDb().collection('garages');
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
  } catch (err: any) {
    console.error('[Worker Garage] Error listing garages:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Read-only consistency diagnostics & Event Ledger reconciliation.
app.post('/api/garages/reconciliation', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canRunGarageMaintenance(user, 'reconciliation')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const garageId = validateId(body?.garageId, 'garageId', true);
    const garageRef = getAdminDb().doc(`garages/${garageId}`);
    const garageSnap = await garageRef.get();
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(today);
    const [insideSnap, dailyStatsSnap, eventsSnap] = await Promise.all([
      getAdminDb().collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get(),
      getAdminDb().doc(`garages/${garageId}/daily_stats/${today}`).get(),
      getAdminDb().collection(`garages/${garageId}/events`)
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
    if (!garageId || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const targetDate = date || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    if (!isValidDateKey(targetDate)) throw new Error('INVALID_DATE');

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const [bucketSnap, eventsSnap, garageSnap, dailyStatsSnap] = await Promise.all([
      getAdminDb().collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', targetDate).get(),
      getAdminDb().collection(`garages/${garageId}/events`)
        .where('occurredAt', '>=', dayStart.toISOString())
        .where('occurredAt', '<', nextDayStart.toISOString())
        .orderBy('occurredAt', 'asc')
        .get(),
      getAdminDb().doc(`garages/${garageId}`).get(),
      getAdminDb().doc(`garages/${garageId}/daily_stats/${targetDate}`).get()
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
    await getAdminDb().doc(`garages/${garageId}/dashboard_summary/current`).set(summaryData, { merge: true });
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
    if (!garageId || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    const targetDate = date || new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    if (!isValidDateKey(targetDate)) return c.json({ success: false, error: 'INVALID_DATE' }, 400);

    const { start: dayStart, end: nextDayStart } = getCairoDayBounds(targetDate);
    const eventsSnap = await getAdminDb().collection(`garages/${garageId}/events`)
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
    const projectionRef = getAdminDb().doc(`garages/${garageId}/daily_stats/${targetDate}`);
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

app.get('/api/garages/:id/dashboard-summary', requireWorkerAuth, async (c) => {
  const startedAt = Date.now();
  try {
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const user = c.get('user');
    if (!decideGarageScope(user, garageId)) return c.json({ success: false, error: 'FORBIDDEN: Garage summary scope required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const [bucketSnap, garageSnap, dailyStatsSnap] = await Promise.all([
      getAdminDb().collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', today).get(),
      getAdminDb().doc(`garages/${garageId}`).get(),
      getAdminDb().doc(`garages/${garageId}/daily_stats/${today}`).get()
    ]);
    if (!garageSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
    const dailyStatsData = dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {};
    const report = dailyStatsData.reportAggregateVersion === 1 && dailyStatsData.report
      ? dailyStatsData.report
      : undefined;
    c.header('Server-Timing', `dashboard-summary;dur=${Date.now() - startedAt}`);
    if (bucketSnap.empty) {
      const summarySnap = await getAdminDb().doc(`garages/${garageId}/dashboard_summary/current`).get();
      if (!summarySnap.exists) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_NOT_READY' }, 404);
      const storedSummary = summarySnap.data() || {};
      if (!isFreshDashboardSummary(storedSummary, today)) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
      const normalizedMoney = normalizeStoredDashboardMoney(storedSummary);
      if (!normalizedMoney) return c.json({ success: false, error: 'DASHBOARD_SUMMARY_STALE' }, 404);
      c.header('X-Summary-Source', 'stored_rebuild');
      return c.json({ success: true, data: { garageId, summary: { ...storedSummary, ...normalizedMoney, ...(report ? { report } : {}) } } });
    }
    const summary = {
      ...aggregateProjectionBuckets(bucketSnap.docs.map((doc: any) => doc.data() || {})),
      activeVehicleCount: Number(garageSnap.data()?.carsInside || 0),
      garageId,
      dateId: today,
      rebuiltAt: new Date().toISOString(),
      source: 'live_projection_buckets',
      ...(report ? { report } : {})
    };
    c.header('X-Summary-Source', 'live_projection_buckets');
    c.header('X-Summary-Bucket-Count', String(bucketSnap.size));
    return c.json({ success: true, data: { garageId, summary, bucketCount: bucketSnap.size } });
  } catch (error: any) {
    console.error('[Worker Garage] Error reading dashboard summary:', error);
    return c.json({ success: false, error: error?.message || 'SERVER_ERROR' }, 500);
  }
});

app.get('/api/garages/:id', requireWorkerAuth, async (c) => {
  try {
    const id = c.req.param('id');
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const user = c.get('user');
    if (!decideGarageScope(user, id)) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage scope required' }, 403);
    }
    const docSnap = await getAdminDb().doc(`garages/${id}`).get();
    if (!docSnap.exists) return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);

    return c.json({ success: true, garage: { id: docSnap.id, ...docSnap.data() } });
  } catch (err: any) {
    console.error('[Worker Garage] Error fetching garage:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Staff Management Routes
app.post('/api/staff/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { name, phone, pin, garageId, role, permissions } = body;
    if (!canManageStaffForGarage(user, garageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot add staff to this garage' }, 403);
    }

    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    const normPin = validateNewPin(pin);

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const staffRef = getAdminDb().collection('staff').doc();
    const staffId = staffRef.id;

    await getAdminDb().runTransaction(async (t: any) => {
      await saveEntityPinInTransaction(t, 'staff', staffId, normPin);
      t.set(staffRef, {
        name: normName.trim(),
        phone: phone ? String(phone).trim() : '',
        garageId,
        role: role || 'worker',
        permissions: permissions || {},
        createdAt: new Date()
      });
    });

    return c.json({ success: true, id: staffId });
  } catch (e: any) {
    console.error('[Worker Staff] Error in create:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/staff/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id, name, phone, role, permissions, pin } = body;
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const staffId = validateId(id, 'id', true);
    const staffRef = getAdminDb().collection('staff').doc(staffId);

    // Authorize the target before checking global PIN uniqueness, which otherwise
    // lets callers probe whether a PIN is already assigned outside their garage.
    const initialStaffSnap = await staffRef.get();
    if (!initialStaffSnap.exists) throw new Error('STAFF_NOT_FOUND');
    if (!canManageStaffForGarage(user, initialStaffSnap.data()?.garageId)) {
      throw new Error('FORBIDDEN: Cannot update staff outside your garage');
    }

    const normalizedPin = pin ? validateNewPin(pin, 'newPin') : null;
    if (normalizedPin) {
      const pinCheck = await checkPinAvailabilityAcrossAll(normalizedPin, staffId);
      if (pinCheck.taken) return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();
    if (role) updates.role = role;
    if (permissions) updates.permissions = permissions;

    await getAdminDb().runTransaction(async (t: any) => {
      const targetStaffSnap = await t.get(staffRef);
      if (!targetStaffSnap.exists) throw new Error('STAFF_NOT_FOUND');
      if (!canManageStaffForGarage(user, targetStaffSnap.data()?.garageId)) {
        throw new Error('FORBIDDEN: Cannot update staff outside your garage');
      }
      if (normalizedPin) await saveEntityPinInTransaction(t, 'staff', staffId, normalizedPin);
      t.update(staffRef, updates);
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Staff] Error in update:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e?.message === 'STAFF_NOT_FOUND') return c.json({ success: false, error: 'STAFF_NOT_FOUND' }, 404);
    if (String(e?.message || '').includes('FORBIDDEN')) return c.json({ success: false, error: 'FORBIDDEN: Cannot update staff outside your garage' }, 403);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/staff/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id } = body;
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const staffId = validateId(id, 'id', true);
    const staffRef = getAdminDb().collection('staff').doc(staffId);

    // 1. Verify authorization and read the staff doc before mutation.
    const staffSnap = await staffRef.get();
    if (!staffSnap.exists) {
      if (user?.role === 'admin') return c.json({ success: true, alreadyDeleted: true });
      return c.json({ success: false, error: 'STAFF_NOT_FOUND' }, 404);
    }
    const staffData = staffSnap.data() || {};
    if (user?.role !== 'admin' && !canManageStaffForGarage(user, staffData.garageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Cannot delete staff outside your garage' }, 403);
    }

    // 2. Revoke all active sessions for this staff member BEFORE deleting the doc.
    const now = new Date();
    let revokedSessions = 0;
    const crypto = await import('crypto');
    const hashSessionId = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
    const staffSessionsSnap = await getAdminDb().collection('staff_sessions')
      .where('entityId', '==', staffId)
      .get();
    const adminAuthInstance = getAdminAuth();
    const uidsToDelete: string[] = [];
    let sessionBatch = getAdminDb().batch();
    let sessionBatchWrites = 0;
    for (const sessionDoc of staffSessionsSnap.docs) {
      const sessionData = sessionDoc.data() || {};
      const uid = sessionData.uid;
      if (uid && !uidsToDelete.includes(uid)) uidsToDelete.push(uid);
      if (sessionData.isActive === true) revokedSessions += 1;
      sessionBatch.update(sessionDoc.ref, { isActive: false, lastActive: now });
      sessionBatchWrites += 1;
      if (sessionData.uid && sessionData.sessionId) {
        sessionBatch.set(getAdminDb().doc(`session_index/${hashSessionId(`${sessionData.uid}:${sessionData.sessionId}`)}`), { isActive: false, updatedAt: now }, { merge: true });
        sessionBatchWrites += 1;
      }
      const deviceSessions = await getAdminDb().collection(`staff_sessions/${sessionDoc.id}/sessions`).get();
      for (const deviceDoc of deviceSessions.docs) {
        const deviceData = deviceDoc.data() || {};
        if (deviceData.isActive === true) revokedSessions += 1;
        sessionBatch.update(deviceDoc.ref, { isActive: false, lastActive: now });
        sessionBatchWrites += 1;
        if (deviceData.uid && deviceData.sessionId) {
          sessionBatch.set(getAdminDb().doc(`session_index/${hashSessionId(`${deviceData.uid}:${deviceData.sessionId}`)}`), { isActive: false, updatedAt: now }, { merge: true });
          sessionBatchWrites += 1;
        }
        if (sessionBatchWrites >= 450) { await sessionBatch.commit(); sessionBatch = getAdminDb().batch(); sessionBatchWrites = 0; }
      }
      if (sessionBatchWrites >= 450) { await sessionBatch.commit(); sessionBatch = getAdminDb().batch(); sessionBatchWrites = 0; }
    }
    if (sessionBatchWrites > 0) await sessionBatch.commit();

    // 3. Delete the staff doc and its PIN atomically.
    await getAdminDb().runTransaction(async (t: any) => {
      await deleteEntityPinInTransaction(t, 'staff', staffId);
      t.delete(staffRef);
    });

    // 4. Delete the Firebase Auth user(s) — prevents any future login.
    let deletedAuthUsers = 0;
    if (adminAuthInstance) {
      for (const uid of uidsToDelete) {
        try {
          await adminAuthInstance.deleteUser(uid);
          deletedAuthUsers += 1;
        } catch (err: any) {
          console.warn(`[Worker Staff] Could not delete Auth user ${uid} for staff ${staffId}:`, err?.message || err);
        }
      }
    }

    // 5. Delete this staff member's activity history.
    let deletedActivityLogs = 0;
    let activityBatch = getAdminDb().batch();
    let activityBatchWrites = 0;
    const activitySnap = await getAdminDb().collection('activity_logs')
      .where('staffId', '==', staffId)
      .get();
    for (const doc of activitySnap.docs) {
      activityBatch.delete(doc.ref);
      activityBatchWrites += 1;
      deletedActivityLogs += 1;
      if (activityBatchWrites >= 450) { await activityBatch.commit(); activityBatch = getAdminDb().batch(); activityBatchWrites = 0; }
    }
    if (activityBatchWrites > 0) await activityBatch.commit();

    return c.json({ success: true, revokedSessions, deletedAuthUsers, deletedActivityLogs });
  } catch (e: any) {
    console.error('[Worker Staff] Error in delete:', e);
    if (String(e?.message || '').includes('FORBIDDEN')) return c.json({ success: false, error: 'FORBIDDEN: Cannot delete staff outside your garage' }, 403);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Delegates Management Routes
app.post('/api/delegates/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const retiredField = ['commissionRate', 'commissions', 'balance', 'totalEarned']
      .find((field) => body[field] !== undefined);
    if (retiredField) {
      return c.json({ success: false, error: 'RETIRED_DELEGATE_FIELD', field: retiredField }, 400);
    }
    const { name, phone, pin } = body;
    const normName = validateString(name, 'name', { min: 2, max: 100, required: true })!;
    const normPhone = phone ? String(phone).trim() : '';
    const normPin = validateNewPin(pin);

    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    const delRef = getAdminDb().collection('delegates').doc();
    const delId = delRef.id;

    await getAdminDb().runTransaction(async (t: any) => {
      await saveEntityPinInTransaction(t, 'delegates', delId, normPin);
      t.set(delRef, {
        name: normName.trim(),
        phone: normPhone,
        totalCommissionEarned: 0,
        totalRechargedAmount: 0,
        createdAt: new Date()
      });
      writeMaintainedAdminDelta(t, { totalDelegates: 1 });
    });

    return c.json({ success: true, id: delId });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in create:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/delegates/update', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canManageDelegates(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id, name, phone, pin } = body;
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const delegateId = validateId(id, 'id', true);
    const retiredField = ['commissionRate', 'commissions', 'balance', 'totalEarned']
      .find((field) => body[field] !== undefined);
    if (retiredField) {
      return c.json({ success: false, error: 'RETIRED_DELEGATE_FIELD', field: retiredField }, 400);
    }
    const unsupportedFields = Object.keys(body).filter((field) =>
      !['id', 'name', 'phone', 'pin'].includes(field)
    );
    if (unsupportedFields.length > 0) {
      return c.json({ success: false, error: `UNSUPPORTED_FIELDS: ${unsupportedFields.join(',')}` }, 400);
    }

    const normalizedPin = pin ? validateNewPin(pin, 'newPin') : null;
    if (normalizedPin) {
      const pinCheck = await checkPinAvailabilityAcrossAll(normalizedPin, delegateId);
      if (pinCheck.taken) return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name) updates.name = String(name).trim();
    if (phone !== undefined) updates.phone = String(phone).trim();

    const delegateRef = getAdminDb().collection('delegates').doc(delegateId);
    await getAdminDb().runTransaction(async (t: any) => {
      const delegateSnap = await t.get(delegateRef);
      if (!delegateSnap.exists) throw new Error('DELEGATE_NOT_FOUND');
      if (normalizedPin) await saveEntityPinInTransaction(t, 'delegates', delegateId, normalizedPin);
      t.update(delegateRef, updates);
    });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in update:', e);
    if (e?.message === 'PIN_ALREADY_TAKEN') return c.json({ success: false, error: 'PIN_ALREADY_TAKEN' }, 409);
    if (e?.message === 'DELEGATE_NOT_FOUND') return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    if (e instanceof ValidationError) return c.json({ success: false, error: e.code }, e.statusCode as any);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/delegates/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!canManageDelegates(user)) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { id } = body;
    if (!id || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);
    const delegateId = validateId(id, 'id', true);
    const delegateRef = getAdminDb().collection('delegates').doc(delegateId);
    let missingDelegate = false;
    let unsettledCycleTotal = 0;
    await getAdminDb().runTransaction(async (t: any) => {
      const delegateSnap = await t.get(delegateRef);
      if (!delegateSnap.exists) {
        missingDelegate = true;
        return;
      }
      const delegateData = delegateSnap.data() || {};
      unsettledCycleTotal = Number(delegateData.totalRechargedAmount || 0);
      if (!Number.isFinite(unsettledCycleTotal) || unsettledCycleTotal !== 0) return;
      await deleteEntityPinInTransaction(t, 'delegates', delegateId);
      t.delete(delegateRef);
    });
    if (missingDelegate) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);
    if (!Number.isFinite(unsettledCycleTotal) || unsettledCycleTotal !== 0) {
      return c.json({
        success: false,
        error: 'DELEGATE_HAS_UNSETTLED_COMMISSION',
        unsettledCycleTotal
      }, 409);
    }

    await maintainedAdminSummaryRef().set({ schemaVersion: MAINTAINED_SUMMARY_VERSION, summaryScope: 'admin', stale: true, updatedAt: new Date() }, { merge: true });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Delegate] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// People / Entity PIN Update
app.post('/api/people/update-pin', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, any>));
    const { entityType, entityId, newPin } = body;
    if (!entityType || !entityId || !['garages', 'delegates', 'staff'].includes(entityType)) {
      return c.json({ success: false, error: 'INVALID_ENTITY_TYPE' }, 400);
    }

    const normNewPin = validateNewPin(newPin, 'newPin');
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    let targetGarageId: unknown = entityType === 'garages' ? entityId : undefined;
    if (entityType === 'staff' && user?.role !== 'admin') {
      const targetStaffSnap = await getAdminDb().collection('staff').doc(entityId).get();
      targetGarageId = targetStaffSnap.exists ? targetStaffSnap.data()?.garageId : null;
    }
    if (!canUpdateEntityPin(user, entityType, targetGarageId)) {
      return c.json({ success: false, error: 'FORBIDDEN: Insufficient permissions' }, 403);
    }

    const pinCheck = await checkPinAvailabilityAcrossAll(normNewPin, entityId);
    if (pinCheck.taken) {
      return c.json({
        success: false,
        error: 'PIN_ALREADY_TAKEN',
        takenBy: { name: pinCheck.name || '', role: pinCheck.role }
      }, 400);
    }

    await saveEntityPin(entityType, entityId, normNewPin);

    const targetDocRef = getAdminDb().collection(entityType).doc(entityId);
    const docSnap = await targetDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      const updates: Record<string, any> = { updatedAt: new Date() };
      if ('pin' in data) updates.pin = null;
      if ('ownerPin' in data) updates.ownerPin = null;
      if ('adminPin' in data) updates.adminPin = null;
      if ('pinLookupHash' in data) updates.pinLookupHash = null;
      await targetDocRef.set(updates, { merge: true });
    }

    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker People] Error in update-pin:', e);
    if (e instanceof ValidationError) {
      return c.json({ success: false, error: `INVALID_NEW_PIN: ${e.message}` }, e.statusCode as any);
    }
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Admin Announcements Routes
app.post('/api/admin/announcements/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const data = { ...body, createdAt: new Date() };
    const docRef = await getAdminDb().collection('announcements').add(data);
    return c.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error('[Worker Announcements] Error in create:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/admin/announcements/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await getAdminDb().collection('announcements').doc(id).delete();
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Announcements] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

app.post('/api/admin/announcements/toggle', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id, isActive } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await getAdminDb().collection('announcements').doc(id).update({ isActive: Boolean(isActive) });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Announcements] Error in toggle:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Admin Packages Routes
app.post('/api/admin/packages/create', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const rawPackage = await c.req.json().catch(() => ({}));
    if (rawPackage.catalogType !== 'credit_bundle') throw new Error('PACKAGE_NOT_CREDIT_BUNDLE');
    const validatedPackage = validatePackageCatalogRecord(rawPackage, 'new');
    if (validatedPackage.catalogType !== 'credit_bundle') throw new Error('PACKAGE_NOT_CREDIT_BUNDLE');
    const pkgData: Record<string, any> = {
      name: validatedPackage.name,
      price: validatedPackage.basePrice,
      catalogType: validatedPackage.catalogType,
      isActive: true,
      createdAt: new Date()
    };
    pkgData.creditQuantity = validatedPackage.creditQuantity;

    const docRef = await getAdminDb().collection('packages').add(pkgData);
    return c.json({ success: true, id: docRef.id });
  } catch (e: any) {
    console.error('[Worker Packages] Error in create:', e);
    const statusCode = ['INVALID_PACKAGE_CONFIGURATION', 'PACKAGE_NOT_CREDIT_BUNDLE'].includes(e?.message) ? 400 : 500;
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, statusCode as any);
  }
});

app.post('/api/admin/packages/delete', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);

    const body = await c.req.json().catch(() => ({}));
    const { id } = body;
    if (!id) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    await getAdminDb().collection('packages').doc(id).update({ isActive: false });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Packages] Error in delete:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

// Admin confirms offline payment and explicitly grants non-expiring prepaid credits.
app.post('/api/garages/:id/credit-grants', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') return c.json({ success: false, error: 'ADMIN_ONLY' }, 403);
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const body = await c.req.json().catch(() => ({}));
    const sanitized = sanitizePayload(body, ['packageId', 'amount', 'paymentAmountEgp', 'paymentConfirmed', 'paymentReference', 'reason', 'idempotencyKey'], false);
    if (sanitized.paymentConfirmed !== true) return c.json({ success: false, error: 'PAYMENT_CONFIRMATION_REQUIRED' }, 400);
    const paymentReference = validateString(sanitized.paymentReference, 'paymentReference', { min: 1, max: 120, required: true });
    const reason = validateString(sanitized.reason, 'reason', { min: 1, max: 300, required: true });
    const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || c.req.header('idempotency-key') || c.req.header('x-idempotency-key'));
    if (!idempotencyKey) return c.json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    const packageId = sanitized.packageId ? validateId(sanitized.packageId, 'packageId', true) : null;
    if (packageId === null && sanitized.amount === undefined) return c.json({ success: false, error: 'CREDIT_AMOUNT_REQUIRED' }, 400);
    if (packageId !== null && sanitized.amount !== undefined) return c.json({ success: false, error: 'CHOOSE_TEMPLATE_OR_AMOUNT' }, 400);
    const paymentAmountEgp = validateNumber(sanitized.paymentAmountEgp, 'paymentAmountEgp', { min: 50, max: 2_000, integerOnly: true });
    const callerUid = user.uid;
    const requestFingerprint = createRequestFingerprint({ garageId, packageId, amount: sanitized.amount, paymentAmountEgp, paymentReference, reason });
    // Payment references are unique per-garage (Q24B): the same transfer reference
    // may be used by two different garages, but never twice for the same garage.
    const paymentReferenceMarkerId = encodeURIComponent(`${garageId}:${paymentReference}`).slice(0, 150);
    const paymentReferenceMarkerRef = getAdminDb().doc(`payment_reference_markers/${paymentReferenceMarkerId}`);
    let granted: any = null;
    await getAdminDb().runTransaction(async (t: any) => {
      const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, '/api/garages/:id/credit-grants', callerUid, requestFingerprint);
      if (isDuplicate) { granted = cachedResult; return; }
      const referenceMarkerSnapshot = await t.get(paymentReferenceMarkerRef);
      if (referenceMarkerSnapshot.exists) {
        const marker = referenceMarkerSnapshot.data?.() || {};
        if (marker.idempotencyKey === idempotencyKey && marker.result) {
          granted = marker.result;
          return;
        }
        throw new Error('PAYMENT_REFERENCE_ALREADY_USED');
      }
      const garageRef = getAdminDb().doc(`garages/${garageId}`);
      const garageSnap = await t.get(garageRef);
      if (!garageSnap.exists) throw new Error('GARAGE_NOT_FOUND');
      const garage = garageSnap.data() || {};
      if (garage.billingModel !== 'prepaid_credits') throw new Error('GARAGE_NOT_PREPAID');
      const isFirstPaidGrant = !garage.firstPaidCreditGrantAt;
      const isFirstQualifyingGrant = !garage.firstQualifyingGrantAt && paymentAmountEgp >= 500;
      const commissionDelegateId = isFirstQualifyingGrant && typeof garage.createdByDelegateId === 'string'
        ? garage.createdByDelegateId.trim()
        : '';
      const commissionDelegateRef = commissionDelegateId
        ? getAdminDb().collection('delegates').doc(commissionDelegateId)
        : null;
      const commissionDelegateSnap = commissionDelegateRef ? await t.get(commissionDelegateRef) : null;
      if (commissionDelegateRef && !commissionDelegateSnap?.exists) throw new Error('DELEGATE_NOT_FOUND');
      const commissionDelegateData = commissionDelegateSnap?.data() || {};
      const currentLifetimeCommission = commissionDelegateRef
        ? parseMoneyAmount(commissionDelegateData.totalCommissionEarned ?? 0)
        : null;
      const currentUnsettledCommission = commissionDelegateRef
        ? parseMoneyAmount(commissionDelegateData.totalRechargedAmount ?? 0)
        : null;
      if (commissionDelegateRef && (currentLifetimeCommission === null || currentUnsettledCommission === null)) {
        throw new Error('INVALID_DELEGATE_COMMISSION_BALANCE');
      }
      const nextLifetimeCommission = commissionDelegateRef
        ? parseMoneyAmount(currentLifetimeCommission! + 100)
        : null;
      const nextUnsettledCommission = commissionDelegateRef
        ? parseMoneyAmount(currentUnsettledCommission! + 100)
        : null;
      if (commissionDelegateRef && (nextLifetimeCommission === null || nextUnsettledCommission === null)) {
        throw new Error('INVALID_DELEGATE_COMMISSION_BALANCE');
      }
      const referrerGarageId = typeof garage.referredByGarageId === 'string' ? garage.referredByGarageId : '';
      const referralMarkerRef = isFirstQualifyingGrant ? getAdminDb().doc(`credit_referral_awards/${garageId}`) : null;
      const referralMarkerSnap = referralMarkerRef ? await t.get(referralMarkerRef) : null;
      const referrerRef = isFirstQualifyingGrant && referralMarkerRef && !referralMarkerSnap?.exists && referrerGarageId && referrerGarageId !== garageId ? getAdminDb().doc(`garages/${referrerGarageId}`) : null;
      const referrerSnap = referrerRef ? await t.get(referrerRef) : null;
      let amount: number;
      let template: any = null;
      if (packageId) {
        const templateRef = getAdminDb().doc(`packages/${packageId}`);
        const templateSnap = await t.get(templateRef);
        if (!templateSnap.exists) throw new Error('PACKAGE_NOT_FOUND');
        template = { id: templateSnap.id, ...templateSnap.data() };
        if (template.isActive === false || template.catalogType !== 'credit_bundle') throw new Error('PACKAGE_NOT_CREDIT_BUNDLE');
        const validatedTemplate = validatePackageCatalogRecord(template, template.id);
        amount = validatedTemplate.creditQuantity;
        if (validatedTemplate.finalPrice !== amount) throw new Error('CREDIT_TEMPLATE_PRICE_MISMATCH');
      } else {
        amount = validateNumber(sanitized.amount, 'amount', { min: 50, max: 2_000, integerOnly: true });
      }
      if (paymentAmountEgp !== amount) throw new Error('PAYMENT_AMOUNT_MUST_MATCH_CREDITS');
      const balance = {
        paid: Number(garage.creditBalance?.paid || 0),
        referral: Number(garage.creditBalance?.referral || 0),
        trial: Number(garage.creditBalance?.trial || 0),
      };
      const transition = grantPaidCredits({ balance, amount, garageId, actorUid: callerUid, actorRole: 'admin', reason, reference: paymentReference, occurredAt: new Date().toISOString(), idempotencyKey });
      if (transition.ok === false) throw new Error(transition.error);
      const entry = materializeCreditLedgerEntry(transition.value.entry);
      if (entry.ok === false) throw new Error(entry.error);
      let referralAward: any = null;
      let referralLedger: any = null;
      let referralTransition: any = null;
      if (isFirstQualifyingGrant && referrerRef && referrerSnap?.exists && referrerSnap.data()?.billingModel === 'prepaid_credits' && referralMarkerRef && !referralMarkerSnap?.exists) {
        const referrer = referrerSnap.data() || {};
        const rewardIdempotencyKey = `first_paid_grant:${garageId}`;
        referralTransition = awardReferralCredits({
          balance: { paid: Number(referrer.creditBalance?.paid || 0), referral: Number(referrer.creditBalance?.referral || 0), trial: Number(referrer.creditBalance?.trial || 0) },
          garageId: referrerGarageId,
          actorUid: callerUid,
          actorRole: 'admin',
          reason: 'First confirmed paid grant referral reward',
          reference: garageId,
          occurredAt: transition.value.entry.occurredAt,
          idempotencyKey: rewardIdempotencyKey,
          referrerGarageId,
          referredGarageId: garageId,
          paidGrantConfirmed: true,
          firstPaidGrant: true,
        });
        if (referralTransition.ok === false) throw new Error(referralTransition.error);
        const materializedReward = materializeCreditLedgerEntry(referralTransition.value.entry);
        if (materializedReward.ok === false) throw new Error(materializedReward.error);
        referralLedger = materializedReward.value;
        referralAward = { garageId: referrerGarageId, amount: 20, bucket: 'referral', entryId: referralLedger.entryId };
      }
      const now = new Date();
      // Admin revenue = the EGP you collected from this garage for paid credits (1 EGP = 1 credit).
      // This is SEPARATE from garage revenue (what the garage earned from cars).
      const currentAdminRevenue = Number(garage.totalAdminRevenue || 0);
      const newAdminRevenue = currentAdminRevenue + paymentAmountEgp;
      t.set(garageRef, {
        creditBalance: transition.value.balance,
        totalAdminRevenue: newAdminRevenue,
        ...(isFirstPaidGrant ? { firstPaidCreditGrantAt: now } : {}),
        ...(isFirstQualifyingGrant ? { firstQualifyingGrantAt: now } : {})
      }, { merge: true });
      t.set(getAdminDb().doc(`credit_ledger/${entry.value.entryId}`), { ...entry.value, source: packageId ? 'admin_template_grant' : 'admin_entered_grant', packageId, packageName: template?.name || null, paymentConfirmed: true, paymentAmountEgp, paymentReference });
      recordDomainEventInTransaction(t, getAdminDb(), {
        garageId,
        aggregateType: 'credit_grant',
        aggregateId: entry.value.entryId,
        eventType: 'prepaid_credit_grant_paid',
        actorUid: callerUid,
        actorRole: 'admin',
        idempotencyKey,
        payload: { amount: paymentAmountEgp, creditAmount: amount, creditLedgerEntryId: entry.value.entryId }
      });
      if (commissionDelegateRef && commissionDelegateId) {
        t.update(commissionDelegateRef, {
          totalCommissionEarned: nextLifetimeCommission,
          totalRechargedAmount: nextUnsettledCommission,
          updatedAt: now
        });
        recordDomainEventInTransaction(t, getAdminDb(), {
          garageId,
          aggregateType: 'delegate',
          aggregateId: commissionDelegateId,
          eventType: 'commission_earned',
          actorUid: callerUid,
          actorRole: 'admin',
          idempotencyKey: `first_paid_grant_commission:${garageId}`,
          payload: {
            delegateId: commissionDelegateId,
            commissionAmount: 100,
            sourceCreditGrantId: entry.value.entryId,
            earnedAt: now.toISOString()
          }
        });
      }
      t.set(getAdminDb().collection('activity_logs').doc(), { garageId, garageName: garage.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_grant', timestamp: new Date(), details: { amount, paymentAmountEgp, packageId, paymentReference, reason, ledgerEntryId: entry.value.entryId } });
      if (referralLedger && referralAward && referrerRef && referralMarkerRef) {
        t.set(referrerRef, { creditBalance: referralTransition.value.balance }, { merge: true });
        t.set(getAdminDb().doc(`credit_ledger/${referralLedger.entryId}`), { ...referralLedger, source: 'first_paid_grant_referral', referredGarageId: garageId });
        t.set(getAdminDb().collection('activity_logs').doc(), { garageId: referrerGarageId, garageName: referrerSnap.data()?.name || '', staffId: callerUid, staffName: user.displayName || 'Admin', actionType: 'credit_referral_award', timestamp: new Date(), details: { referredGarageId: garageId, amount: 20, ledgerEntryId: referralLedger.entryId } });
      }
      if (isFirstQualifyingGrant && referralMarkerRef && !referralMarkerSnap?.exists) {
        t.set(referralMarkerRef, {
          referredGarageId: garageId,
          referrerGarageId: referrerGarageId || null,
          ledgerEntryId: referralLedger?.entryId || null,
          amount: referralLedger ? 20 : 0,
          status: referralLedger ? 'awarded' : (referrerGarageId ? 'referrer_not_prepaid' : 'no_eligible_referrer'),
          createdAt: now,
          createdBy: callerUid,
        });
      }
      granted = { garageId, amount, paymentAmountEgp, balance: transition.value.balance, entryId: entry.value.entryId, referralAward };
      t.set(paymentReferenceMarkerRef, { paymentReference, entryId: entry.value.entryId, garageId, idempotencyKey, result: granted, createdAt: new Date() });
      storeIdempotencyInTransaction(t, idempotencyKey, granted, '/api/garages/:id/credit-grants', callerUid, requestFingerprint);
    });
    return c.json({ success: true, data: granted });
  } catch (error: any) {
    if (error?.message === 'PAYMENT_REFERENCE_ALREADY_USED') {
      return c.json({ success: false, error: 'PAYMENT_REFERENCE_ALREADY_USED' }, 409);
    }
    if (error?.message === 'DELEGATE_NOT_FOUND' || error?.message === 'INVALID_DELEGATE_COMMISSION_BALANCE') {
      return c.json({ success: false, error: error.message }, 409);
    }
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Admin and the garage owner can inspect the same scoped, read-only credit history.
app.get('/api/garages/:id/credit-ledger', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (!getAdminDb()) return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    const garageId = validateId(c.req.param('id'), 'garageId', true);
    const scopedGarage = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);
    if (user?.role !== 'admin' && !scopedGarage) return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    const pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), `credit-ledger:${garageId}`);
    const collection = getAdminDb().collection('credit_ledger');
    let query = collection.where('garageId', '==', garageId).orderBy('occurredAt', 'desc').orderBy('__name__', 'desc');
    query = firestorePageStartAfter(query, collection, pageRequest.cursor);
    const snapshot = await query.limit(pageRequest.pageSize + 1).get();
    const page = buildFirestorePage(snapshot.docs, pageRequest, 'occurredAt');
    const entries = page.documents.map((doc: any) => {
      const row = doc.data() || {};
      const common = { id: doc.id, entryId: row.entryId, garageId: row.garageId, kind: row.kind, bucket: row.bucket, amount: row.amount, balanceBefore: row.balanceBefore, balanceAfter: row.balanceAfter, totalBalanceAfter: row.totalBalanceAfter, occurredAt: row.occurredAt };
      return user?.role === 'admin' ? { ...common, paymentAmountEgp: row.paymentAmountEgp, actorUid: row.actorUid, actorRole: row.actorRole, reason: row.reason, reference: row.reference, idempotencyKey: row.idempotencyKey, source: row.source, packageId: row.packageId, packageName: row.packageName } : common;
    });
    return c.json({ success: true, data: entries, hasMore: page.hasMore, nextCursor: page.nextCursor });
  } catch (error: any) {
    if (error?.message === 'PAYMENT_REFERENCE_ALREADY_USED') {
      return c.json({ success: false, error: 'PAYMENT_REFERENCE_ALREADY_USED' }, 409);
    }
    const { statusCode, message } = mapDomainErrorToStatus(error);
    return c.json({ success: false, error: message }, statusCode as any);
  }
});

// Garage Maintenance: Recalculate Cars Inside
app.post('/api/garages/recalculate-cars-inside', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const { garageId } = body;
    if (!garageId || !getAdminDb()) return c.json({ success: false, error: 'INVALID_REQUEST' }, 400);

    if (!canRunGarageMaintenance(user, 'recalculate-cars-inside')) {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    const vehSnap = await getAdminDb().collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get();
    const actualCount = vehSnap.size;

    await getAdminDb().collection('garages').doc(garageId).update({ carsInside: actualCount });
    return c.json({ success: true, count: actualCount });
  } catch (e: any) {
    console.error('[Worker Garage] Error in recalculate-cars-inside:', e);
    return c.json({ success: false, error: e?.message || 'SERVER_ERROR' }, 500);
  }
});

}

