import type { WorkerApp, WorkerUser } from './cloudflareWorker';
import { lookupSubscriber, safeDateMillis } from './workerReadHelpers';

export interface RouteDeps {
  getAdminDb: () => any;
  requireWorkerAuth: any;
  ValidationError: any;
  validateNumber: any;
  mapDomainErrorToStatus: any;
  maintainedGarageSummaryRef: any;
  maintainedGarageDailySummaryRef: any;
  isUsableMaintainedSummary: any;
  maintainedSummaryVersion: number;
}

const ACTIVE_SYSTEM_CONFIG_FIELDS = ['adminColor', 'paymentWalletNumber'] as const;

const DEFAULT_SYSTEM_CONFIG = {
  adminColor: '#10b981',
  paymentWalletNumber: ''
};

function projectSystemConfig(config: Record<string, any>): Record<string, any> {
  const projected: Record<string, any> = {};
  for (const field of ACTIVE_SYSTEM_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(config, field)) projected[field] = config[field];
  }
  return projected;
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
    maintainedSummaryVersion
  } = deps;

// Private route returning only the active, explicitly allowlisted config fields.
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
      return c.json({ success: true, config: DEFAULT_SYSTEM_CONFIG });
    }
    const activeConfig = projectSystemConfig(snap.data() || {});
    return c.json({ success: true, config: { ...DEFAULT_SYSTEM_CONFIG, ...activeConfig } });
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

    if (body.subscriptionPrices !== undefined || body.defaultTrialDays !== undefined || body.monthlySubscribersFlatFee !== undefined || body.monthlySubscribersSurchargePercent !== undefined) {
      throw new ValidationError('Retired configuration field', 'RETIRED_CONFIG_FIELD', 400);
    }
    if (body.paymentWalletNumber !== undefined) {
      if (typeof body.paymentWalletNumber !== 'string' || body.paymentWalletNumber.length > 120) {
        throw new ValidationError('Invalid paymentWalletNumber', 'INVALID_PAYMENT_WALLET_NUMBER', 400);
      }
      updatePayload.paymentWalletNumber = body.paymentWalletNumber.trim();
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


    await getAdminDb().doc('system_config/global').set(updatePayload, { merge: true });
    return c.json({ success: true });
  } catch (e: any) {
    console.error('[Worker Admin] Error in update-system-config:', e);
    const { statusCode, code, message } = mapDomainErrorToStatus(e);
    return c.json({ success: false, code, error: message, statusCode }, statusCode as any);
  }
});

// 6. Authenticated and Read-Heavy Business Routes (CF4)

// Route 1: POST /api/check-subscriber
app.post('/api/check-subscriber', requireWorkerAuth, async (c) => {
  try {
    if (!getAdminDb()) {
      return c.json({ success: false, error: 'ADMIN_SDK_NOT_INITIALIZED' }, 500);
    }
    const user = c.get('user') as WorkerUser | undefined;
    const body = await c.req.json().catch(() => ({}));
    const garageId = body.garageId ? String(body.garageId).trim() : '';
    const plateNumber = body.plateNumber || body.plate || '';
    const plateRaw = body.plateRaw || body.plateNumberRaw || plateNumber;
    const subscriberId = body.subscriberId ? String(body.subscriberId).trim() : '';
    const phone = body.phone ? String(body.phone).trim() : '';

    if (!garageId) {
      return c.json({ success: false, error: 'GARAGE_ID_REQUIRED' }, 400);
    }
    const isAdmin = user?.role === 'admin';
    const isGarageScoped = (user?.role === 'garage' || user?.role === 'staff')
      && (user.garageId === garageId || user.entityId === garageId);
    if (!isAdmin && !isGarageScoped) {
      return c.json({ success: false, error: 'FORBIDDEN: Subscriber lookup scope required' }, 403);
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
    const subscriber = {
      id: foundDoc.id,
      plateNumber: foundDoc.plateNumber || null,
      plateNumberRaw: foundDoc.plateNumberRaw || null,
      startDate: foundDoc.startDate || null,
      endDate: foundDoc.endDate || null
    };

    return c.json({
      success: true,
      isSubscriber: true,
      isActive,
      subscriber
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
}
