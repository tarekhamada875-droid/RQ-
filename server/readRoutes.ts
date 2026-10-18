import type { WorkerApp, WorkerUser } from './cloudflareWorker';
import { lookupSubscriber, safeDateMillis, sanitizeDelegateDoc } from './workerReadHelpers';
import { buildFirestorePage, firestorePageStartAfter } from './firestorePagination';

export interface RouteDeps {
  getAdminDb: () => any;
  requireWorkerAuth: any;
  ValidationError: any;
  validateNumber: any;
  mapDomainErrorToStatus: any;
  maintainedGarageSummaryRef: any;
  maintainedGarageDailySummaryRef: any;
  isUsableMaintainedSummary: any;
  maintainedAdminSummaryRef: any;
  maintainedSubscriberSummaryRef: any;
  readWorkerFirestorePage: any;
  parseFirestorePageRequest: any;
  maintainedSummaryVersion: number;
}

export function registerReadRoutes(app: WorkerApp, deps: RouteDeps): void {
  const {
    getAdminDb,
    requireWorkerAuth,
    ValidationError,
    validateNumber,
    mapDomainErrorToStatus,
    maintainedGarageSummaryRef,
    maintainedGarageDailySummaryRef,
    isUsableMaintainedSummary,
    maintainedAdminSummaryRef,
    maintainedSubscriberSummaryRef,
    readWorkerFirestorePage,
    parseFirestorePageRequest,
    maintainedSummaryVersion
  } = deps;

// Private full-config route; browser Firestore reads remain governed by firestore.rules.
app.get('/api/system-config', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user') as WorkerUser | undefined;
    if (!user || !['admin', 'garage', 'staff', 'delegate'].includes(user.role)) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }

    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }
    const snap = await getAdminDb().doc('system_config/global').get();
    if (!snap.exists) {
      return c.json({
        success: true,
        config: {
          defaultTrialDays: 2,
          warningDaysThreshold: 3,
          walletNumber: '',
          monthlySubscribersFlatFee: 250,
          monthlySubscribersSurchargePercent: 25,
          referralFeePerRenewal: 100,
          delegateMonthlyCommission: 100,
          isMaintenanceMode: false,
          maintenanceMessage: '',
          adminColor: '#10b981'
        }
      });
    }
    return c.json({ success: true, config: { id: snap.id, ...snap.data() } });
  } catch (e: any) {
    console.error('[Worker] Error fetching system-config:', e);
    return c.json({ success: false, error: 'SERVER_ERROR' }, 500);
  }
});

// Foundation Route: POST /api/admin/update-system-config
app.post('/api/admin/update-system-config', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }

    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const body = await c.req.json().catch(() => ({}));
    const updatePayload: Record<string, any> = {
      updatedAt: new Date()
    };

    if (body.walletNumber !== undefined) {
      if (typeof body.walletNumber !== 'string' || body.walletNumber.length > 100) {
        throw new ValidationError('Invalid walletNumber', 'INVALID_WALLET_NUMBER', 400);
      }
      updatePayload.walletNumber = body.walletNumber.trim();
    }
    if (body.defaultTrialDays !== undefined) {
      updatePayload.defaultTrialDays = validateNumber(body.defaultTrialDays, 'defaultTrialDays', { min: 0, integerOnly: true });
    }
    if (body.warningDaysThreshold !== undefined) {
      updatePayload.warningDaysThreshold = validateNumber(body.warningDaysThreshold, 'warningDaysThreshold', { min: 0, integerOnly: true });
    }
    if (body.monthlySubscribersFlatFee !== undefined) {
      updatePayload.monthlySubscribersFlatFee = validateNumber(body.monthlySubscribersFlatFee, 'monthlySubscribersFlatFee', { min: 0 });
    }
    if (body.monthlySubscribersSurchargePercent !== undefined) {
      updatePayload.monthlySubscribersSurchargePercent = validateNumber(body.monthlySubscribersSurchargePercent, 'monthlySubscribersSurchargePercent', { min: 0 });
    }
    if (body.referralFeePerRenewal !== undefined) {
      updatePayload.referralFeePerRenewal = validateNumber(body.referralFeePerRenewal, 'referralFeePerRenewal', { min: 0 });
    }
    if (body.delegateMonthlyCommission !== undefined) {
      updatePayload.delegateMonthlyCommission = validateNumber(body.delegateMonthlyCommission, 'delegateMonthlyCommission', { min: 0 });
    }
    if (body.isMaintenanceMode !== undefined) {
      if (typeof body.isMaintenanceMode !== 'boolean') {
        throw new ValidationError('Invalid isMaintenanceMode', 'INVALID_IS_MAINTENANCE_MODE', 400);
      }
      updatePayload.isMaintenanceMode = body.isMaintenanceMode;
    }
    if (body.maintenanceMessage !== undefined) {
      if (typeof body.maintenanceMessage !== 'string' || body.maintenanceMessage.length > 1000) {
        throw new ValidationError('Invalid maintenanceMessage', 'INVALID_MAINTENANCE_MESSAGE', 400);
      }
      updatePayload.maintenanceMessage = body.maintenanceMessage.trim();
    }
    if (body.adminColor !== undefined) {
      if (typeof body.adminColor !== 'string' || body.adminColor.length > 32) {
        throw new ValidationError('Invalid adminColor', 'INVALID_ADMIN_COLOR', 400);
      }
      updatePayload.adminColor = body.adminColor.trim();
    }
    if (body.subscriptionPrices !== undefined) {
      if (!body.subscriptionPrices || typeof body.subscriptionPrices !== 'object' || Array.isArray(body.subscriptionPrices)) {
        throw new ValidationError('Invalid subscriptionPrices', 'INVALID_SUBSCRIPTION_PRICES', 400);
      }
      const validatedPrices: Record<string, number> = {};
      for (const [name, price] of Object.entries(body.subscriptionPrices)) {
        if (!name.trim() || name.length > 100) {
          throw new ValidationError('Invalid subscription price name', 'INVALID_SUBSCRIPTION_PRICE_NAME', 400);
        }
        validatedPrices[name] = validateNumber(price, `subscriptionPrices.${name}`, { min: 0 });
      }
      updatePayload.subscriptionPrices = validatedPrices;
    }

    await getAdminDb().doc('system_config/global').set(updatePayload, { merge: true });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Admin] Error in update-system-config:', e);
    const { statusCode, code, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, code, error: message, statusCode }, statusCode as any);
  }
});

// 6. Public and Read-Heavy Business Routes (CF4)

// Route 1: POST /api/check-subscriber
app.post('/api/check-subscriber', async (c) => {
  try {
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }
    const body = await c.req.json().catch(() => ({}));
    const garageId = body.garageId ? String(body.garageId).trim() : '';
    const plateNumber = body.plateNumber || body.plate || '';
    const plateRaw = body.plateRaw || body.plateNumberRaw || plateNumber;
    const subscriberId = body.subscriberId ? String(body.subscriberId).trim() : '';
    const phone = body.phone ? String(body.phone).trim() : '';

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }

    const subCollection = getAdminDb().collection(`garages/${garageId}/subscribers`);
    const foundDoc = await lookupSubscriber(subCollection, { subscriberId, plateRaw, plateNumber, phone });

    if (!foundDoc) {
      return c.json({
        success: true,
        isSubscriber: false,
        isActive: false,
        subscriber: null
      });
    }

    // Check if subscriber is active based on end date
    const now = Date.now();
    const endMillis = safeDateMillis(foundDoc.endDate);
    const startMillis = safeDateMillis(foundDoc.startDate);
    const isActive = (endMillis === 0 || endMillis >= now) && (startMillis === 0 || startMillis <= now);

    return c.json({
      success: true,
      isSubscriber: true,
      isActive,
      subscriber: foundDoc
    });
  } catch (err: any) {
    console.error('[Worker] Error in check-subscriber:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 2: GET /api/garage-summary
app.get('/api/garage-summary', requireWorkerAuth, async (c) => {
  try {
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }
    const user = c.get('user');
    const garageId = c.req.query('garageId') || user?.garageId || (user?.role === 'garage' ? user?.entityId : null);

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }

    const isAdmin = user?.role === 'admin';
    const isGarageScoped = (user?.role === 'garage' || user?.role === 'staff') && (user?.garageId === garageId || user?.entityId === garageId);

    if (!isAdmin && !isGarageScoped) {
      return c.json({ success: false, error: 'FORBIDDEN: Garage summary scope required' }, 403);
    }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    const [maintainedGarageSnap, maintainedDailySnap] = await Promise.all([
      maintainedGarageSummaryRef(garageId).get(),
      maintainedGarageDailySummaryRef(garageId, today).get()
    ]);
    const maintainedGarage = maintainedGarageSnap.exists ? maintainedGarageSnap.data() || {} : null;
    const maintainedDaily = maintainedDailySnap.exists ? maintainedDailySnap.data() || {} : null;
    if (isUsableMaintainedSummary(maintainedGarage, ['carsInside', 'activeSubscribersCount', 'totalSubscribersCount']) &&
        isUsableMaintainedSummary(maintainedDaily, ['todayEntries', 'todayRevenue'])) {
      c.header('X-Summary-Source', 'maintained_summary');
      return c.json({
        success: true,
        data: {
          garageId,
          name: maintainedGarage.name || '',
          carsInside: Number(maintainedGarage.carsInside || 0),
          activeSubscribersCount: Number(maintainedGarage.activeSubscribersCount || 0),
          totalSubscribersCount: Number(maintainedGarage.totalSubscribersCount || 0),
          todayEntries: Number(maintainedDaily.todayEntries || 0),
          todayRevenue: Number(maintainedDaily.todayRevenue || 0),
          balanceExpiry: maintainedGarage.balanceExpiry || null,
          isTrial: Boolean(maintainedGarage.isTrial),
          dailyCapacity: Number(maintainedGarage.dailyCapacity || 0),
          hourlyRate: Number(maintainedGarage.hourlyRate || 0)
        }
      });
    }

    const [garageSnap, insideVehiclesSnap, subscribersSnap, dailyStatsSnap] = await Promise.all([
      getAdminDb().doc(`garages/${garageId}`).get(),
      getAdminDb().collection(`garages/${garageId}/vehicles`).where('status', '==', 'inside').get(),
      getAdminDb().collection(`garages/${garageId}/subscribers`).get(),
      getAdminDb().doc(`garages/${garageId}/daily_stats/${today}`).get()
    ]);

    if (!garageSnap.exists) {
      return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
    }

    const garageData = garageSnap.data() || {};
    const dailyStats = dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {};
    const now = Date.now();

    const activeSubscribers = subscribersSnap.docs.filter((doc: any) => {
      const data = doc.data() || {};
      const end = safeDateMillis(data.endDate);
      return end === 0 || end >= now;
    }).length;

    await maintainedGarageSummaryRef(garageId).set({
      schemaVersion: maintainedSummaryVersion,
      garageId,
      name: garageData.name || '',
      carsInside: insideVehiclesSnap.size,
      activeSubscribersCount: activeSubscribers,
      totalSubscribersCount: subscribersSnap.size,
      balanceExpiry: garageData.balanceExpiry || null,
      isTrial: Boolean(garageData.isTrial),
      dailyCapacity: Number(garageData.dailyCapacity || 0),
      hourlyRate: Number(garageData.hourlyRate || 0),
      rebuiltAt: new Date()
    }, { merge: true });
    await maintainedGarageDailySummaryRef(garageId, today).set({
      schemaVersion: maintainedSummaryVersion,
      garageId,
      dateId: today,
      todayEntries: Number(dailyStats.count || 0),
      todayRevenue: Number(dailyStats.revenue || dailyStats.netRevenue || 0),
      rebuiltAt: new Date()
    }, { merge: true });

    return c.json({
      success: true,
      data: {
        garageId,
        name: garageData.name || '',
        carsInside: insideVehiclesSnap.size,
        activeSubscribersCount: activeSubscribers,
        totalSubscribersCount: subscribersSnap.size,
        todayEntries: Number(dailyStats.count || 0),
        todayRevenue: Number(dailyStats.revenue || dailyStats.netRevenue || 0),
        balanceExpiry: garageData.balanceExpiry || null,
        isTrial: Boolean(garageData.isTrial),
        dailyCapacity: Number(garageData.dailyCapacity || 0),
        hourlyRate: Number(garageData.hourlyRate || 0)
      }
    });
  } catch (err: any) {
    console.error('[Worker] Error in garage-summary:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 3: GET /api/admin/summary
app.get('/api/admin/summary', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const [maintainedAdminSnap, rechargeRequestsSnap, announcementsSnap] = await Promise.all([
      maintainedAdminSummaryRef().get(),
      getAdminDb().collection('recharge_requests').where('status', '==', 'pending').get(),
      getAdminDb().collection('announcements').where('isActive', '==', true).get()
    ]);
    const maintainedAdmin = maintainedAdminSnap.exists ? maintainedAdminSnap.data() || {} : null;
    if (isUsableMaintainedSummary(maintainedAdmin, ['totalGarages', 'activeGarages', 'lockedGarages', 'totalDelegates', 'totalAdminRevenue'])) {
      c.header('X-Summary-Source', 'maintained_summary');
      return c.json({
        success: true,
        summary: {
          totalGarages: Number(maintainedAdmin.totalGarages || 0),
          activeGarages: Number(maintainedAdmin.activeGarages || 0),
          lockedGarages: Number(maintainedAdmin.lockedGarages || 0),
          totalDelegates: Number(maintainedAdmin.totalDelegates || 0),
          totalAdminRevenue: Number(maintainedAdmin.totalAdminRevenue || 0),
          pendingRechargeRequests: rechargeRequestsSnap.size,
          activeAnnouncements: announcementsSnap.size,
          timestamp: new Date().toISOString()
        }
      });
    }

    const [garagesSnap, delegatesSnap] = await Promise.all([
      getAdminDb().collection('garages').get(),
      getAdminDb().collection('delegates').get()
    ]);

    const now = Date.now();
    let activeGarages = 0;
    let lockedGarages = 0;
    let totalAdminRevenue = 0;
    garagesSnap.docs.forEach((doc: any) => {
      const data = doc.data() || {};
      const expiry = safeDateMillis(data.balanceExpiry);
      if (!data.isTrial || expiry >= now) {
        activeGarages += 1;
      }
      if (data.isLocked) lockedGarages += 1;
      const revenue = Number(data.totalAdminRevenue);
      if (Number.isFinite(revenue)) totalAdminRevenue += revenue;
    });

    await maintainedAdminSummaryRef().set({
      schemaVersion: maintainedSummaryVersion,
      summaryScope: 'admin',
      totalGarages: garagesSnap.size,
      activeGarages,
      lockedGarages,
      totalDelegates: delegatesSnap.size,
      totalAdminRevenue,
      rebuiltAt: new Date()
    }, { merge: true });

    return c.json({
      success: true,
      summary: {
        totalGarages: garagesSnap.size,
        activeGarages,
        lockedGarages,
        totalDelegates: delegatesSnap.size,
        totalAdminRevenue,
        pendingRechargeRequests: rechargeRequestsSnap.size,
        activeAnnouncements: announcementsSnap.size,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin summary:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 4: GET /api/admin/monthly-subscribers-summary
app.get('/api/admin/monthly-subscribers-summary', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const maintainedSnap = await maintainedSubscriberSummaryRef().get();
    const maintained = maintainedSnap.exists ? maintainedSnap.data() || {} : null;
    if (isUsableMaintainedSummary(maintained, ['totalSubscribers', 'activeSubscribers', 'expiredSubscribers', 'garagesCount'])) {
      c.header('X-Summary-Source', 'maintained_summary');
      return c.json({
        success: true,
        data: {
          totalSubscribers: Number(maintained.totalSubscribers || 0),
          activeSubscribers: Number(maintained.activeSubscribers || 0),
          expiredSubscribers: Number(maintained.expiredSubscribers || 0),
          garagesCount: Number(maintained.garagesCount || 0),
          timestamp: new Date().toISOString()
        }
      });
    }

    const subscribersSnap = await getAdminDb().collectionGroup('subscribers').get();
    const now = Date.now();
    let activeCount = 0;
    let expiredCount = 0;
    const distinctGarages = new Set<string>();

    subscribersSnap.docs.forEach((doc: any) => {
      const data = doc.data() || {};
      const end = safeDateMillis(data.endDate);
      if (end === 0 || end >= now) {
        activeCount += 1;
      } else {
        expiredCount += 1;
      }
      if (data.garageId) {
        distinctGarages.add(data.garageId);
      }
    });

    await maintainedSubscriberSummaryRef().set({
      schemaVersion: maintainedSummaryVersion,
      summaryScope: 'subscribers',
      totalSubscribers: subscribersSnap.size,
      activeSubscribers: activeCount,
      expiredSubscribers: expiredCount,
      garagesCount: distinctGarages.size,
      rebuiltAt: new Date()
    }, { merge: true });

    return c.json({
      success: true,
      data: {
        totalSubscribers: subscribersSnap.size,
        activeSubscribers: activeCount,
        expiredSubscribers: expiredCount,
        garagesCount: distinctGarages.size,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in monthly-subscribers-summary:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 5: GET /api/admin/subscribers
app.get('/api/admin/subscribers', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const garageId = c.req.query('garageId');
    const limitQuery = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 50));
    const status = c.req.query('status') || 'all';

    let docs: any[] = [];
    if (garageId) {
      const snap = await getAdminDb().collection(`garages/${garageId}/subscribers`).limit(limitQuery).get();
      docs = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    } else {
      const snap = await getAdminDb().collectionGroup('subscribers').limit(limitQuery).get();
      docs = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    }

    const now = Date.now();
    if (status === 'active') {
      docs = docs.filter((sub) => {
        const end = safeDateMillis(sub.endDate);
        return end === 0 || end >= now;
      });
    } else if (status === 'expired') {
      docs = docs.filter((sub) => {
        const end = safeDateMillis(sub.endDate);
        return end > 0 && end < now;
      });
    }

    return c.json({
      success: true,
      subscribers: docs,
      count: docs.length
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin subscribers:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 6: GET /api/admin/delegates
app.get('/api/admin/delegates', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    let pageRequest;
    try {
      pageRequest = parseFirestorePageRequest(c.req.query('limit'), c.req.query('cursor'), `admin-delegates:${user.uid}`);
    } catch (error: any) {
      return c.json({ success: false, error: error?.message === 'INVALID_PAGE_SIZE' ? 'INVALID_PAGE_SIZE' : 'INVALID_PAGE_CURSOR' }, 400);
    }
    const delegatesCollection = getAdminDb().collection('delegates');
    let delegatesQuery = delegatesCollection.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    delegatesQuery = firestorePageStartAfter(delegatesQuery, delegatesCollection, pageRequest.cursor);
    const delegatesSnapshot = await delegatesQuery.limit(pageRequest.pageSize + 1).get();
    const delegatePage = buildFirestorePage(delegatesSnapshot.docs, pageRequest, 'createdAt');
    const delegates = delegatePage.documents.map((doc: any) => sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));

    return c.json({
      success: true,
      delegates,
      items: delegates,
      hasMore: delegatePage.hasMore,
      nextCursor: delegatePage.nextCursor
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin delegates:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

// Route 7: GET /api/admin/delegates/:id
app.get('/api/admin/delegates/:id', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user');
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }

    const delegateId = c.req.param('id');
    const delegateRef = getAdminDb().collection('delegates').doc(delegateId);
    const delegateSnap = await delegateRef.get();
    if (!delegateSnap.exists) return c.json({ success: false, error: 'DELEGATE_NOT_FOUND' }, 404);

    const section = c.req.query('section');
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
      const pageRequest = parseFirestorePageRequest(c.req.query('limit'), cursor, `admin-delegate:${delegateId}:${name}`);
      return readWorkerFirestorePage(childQuery(name), collection, pageRequest);
    };
    try {
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
    console.error('[Worker Admin] Error in admin delegate details:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});

}
