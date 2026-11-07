import type { WorkerApp, WorkerUser } from './cloudflareWorker';
import { adminDb } from './firebaseAdmin';
import { requireWorkerAuth } from './sessionInfrastructure';
import { ValidationError, validateNumber } from './validation';
import { mapDomainErrorToStatus } from './routes/helpers';
import {
  maintainedGarageSummaryRef,
  maintainedGarageDailySummaryRef,
  isUsableMaintainedSummary,
  MAINTAINED_SUMMARY_VERSION as maintainedSummaryVersion,
} from './workerMaintenance';
import { lookupSubscriber, safeDateMillis, sanitizeDelegateDoc } from './workerReadHelpers';

const ACTIVE_SYSTEM_CONFIG_FIELDS = ['adminColor', 'paymentWalletNumber', 'creditRate'] as const;

const DEFAULT_SYSTEM_CONFIG = {
  adminColor: '#10b981',
  paymentWalletNumber: '',
  creditRate: 1
};

function projectSystemConfig(config: Record<string, any>): Record<string, any> {
  const projected: Record<string, any> = {};
  for (const field of ACTIVE_SYSTEM_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(config, field)) projected[field] = config[field];
  }
  return projected;
}

export function registerReadRoutes(app: WorkerApp): void {

// Private route returning only the active, explicitly allowlisted config fields.
app.get('/api/system-config', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user') as WorkerUser | undefined;
    if (!user || !['admin', 'garage', 'staff', 'delegate'].includes(user.role)) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }

    const snap = await adminDb.doc('system_config/global').get();
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
    if (body.creditRate !== undefined) {
      // Allow 0.01 to 1000. Below 0.01 is effectively free; above 1000 is nonsensical.
      // Integer 1 (default) preserves the legacy 1 EGP = 1 credit behavior.
      const rate = validateNumber(body.creditRate, 'creditRate', { min: 0.01, max: 1000 });
      updatePayload.creditRate = rate;
    }


    await adminDb.doc('system_config/global').set(updatePayload, { merge: true });
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

    const subCollection = adminDb.collection(`garages/${garageId}/subscribers`);
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

    // Audit N13 (Phase 4, 2026-11-06): paginate the fallback reads.
    // Previously these were unpaginated .get() calls that returned ALL
    // inside vehicles + ALL subscribers in memory. For 10k+ docs, this
    // would OOM the Worker (128MB cap). Now we page through in chunks
    // of 450 and count/filter docs without loading them all at once.
    const PAGE_SIZE = 450;
    const garageSnap = await adminDb.doc(`garages/${garageId}`).get();
    const dailyStatsSnap = await adminDb.doc(`garages/${garageId}/daily_stats/${today}`).get();

    if (!garageSnap.exists) {
      return c.json({ success: false, error: 'GARAGE_NOT_FOUND' }, 404);
    }

    const garageData = garageSnap.data() || {};
    const dailyStats = dailyStatsSnap.exists ? dailyStatsSnap.data() || {} : {};
    const now = Date.now();

    // Paginated count of inside vehicles.
    let insideCount = 0;
    let lastInsideDoc: any = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query: any = adminDb.collection(`garages/${garageId}/vehicles`)
        .where('status', '==', 'inside')
        .orderBy('__name__')
        .limit(PAGE_SIZE);
      if (lastInsideDoc) query = query.startAfter(lastInsideDoc);
      const pageSnap = await query.get();
      insideCount += pageSnap.docs.length;
      if (pageSnap.docs.length < PAGE_SIZE) break;
      lastInsideDoc = pageSnap.docs[pageSnap.docs.length - 1];
    }

    // Paginated count of subscribers (total + active).
    let totalSubscribers = 0;
    let activeSubscribers = 0;
    let lastSubDoc: any = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let query: any = adminDb.collection(`garages/${garageId}/subscribers`)
        .orderBy('__name__')
        .limit(PAGE_SIZE);
      if (lastSubDoc) query = query.startAfter(lastSubDoc);
      const pageSnap = await query.get();
      if (pageSnap.docs.length === 0) break;
      for (const doc of pageSnap.docs) {
        totalSubscribers += 1;
        const data = doc.data() || {};
        const end = safeDateMillis(data.endDate);
        if (end === 0 || end >= now) activeSubscribers += 1;
      }
      if (pageSnap.docs.length < PAGE_SIZE) break;
      lastSubDoc = pageSnap.docs[pageSnap.docs.length - 1];
    }

    await maintainedGarageSummaryRef(garageId).set({
      schemaVersion: maintainedSummaryVersion,
      garageId,
      name: garageData.name || '',
      carsInside: insideCount,
      activeSubscribersCount: activeSubscribers,
      totalSubscribersCount: totalSubscribers,
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
        carsInside: insideCount,
        activeSubscribersCount: activeSubscribers,
        totalSubscribersCount: totalSubscribers,
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

// Route: GET /api/admin/delegates — paginated delegates list for the admin panel.
// Returns delegates without PIN/hash fields. Admin-only.
// Called by getAdminDelegatesPage in delegateService.ts.
app.get('/api/admin/delegates', requireWorkerAuth, async (c) => {
  try {
    const user = c.get('user') as WorkerUser | undefined;
    if (user?.role !== 'admin') {
      return c.json({ success: false, error: 'FORBIDDEN: Admin role required' }, 403);
    }
    // Simple cursor pagination: cursor is base64(`${createdAtMillis},${docId}`).
    const limitParam = parseInt(c.req.query('limit') || '50', 10);
    const pageSize = Number.isSafeInteger(limitParam) && limitParam > 0 && limitParam <= 100 ? limitParam : 50;
    const cursor = c.req.query('cursor') || null;

    let cursorCreatedAt: number | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      try {
        const decoded = atob(cursor);
        const commaIdx = decoded.lastIndexOf(',');
        if (commaIdx > 0) {
          cursorCreatedAt = Number(decoded.substring(0, commaIdx));
          cursorId = decoded.substring(commaIdx + 1);
        }
      } catch {
        return c.json({ success: false, error: 'INVALID_PAGE_CURSOR' }, 400);
      }
    }

    const delegatesCollection = adminDb.collection('delegates');
    let delegatesQuery = delegatesCollection.orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    if (cursorCreatedAt !== null && cursorId) {
      delegatesQuery = delegatesQuery.startAfter(cursorCreatedAt, cursorId);
    }
    const delegatesSnapshot = await delegatesQuery.limit(pageSize + 1).get();
    const docs = delegatesSnapshot.docs || [];
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;
    const delegates = pageDocs.map((doc: any) => sanitizeDelegateDoc({ id: doc.id, ...doc.data() }));

    let nextCursor: string | null = null;
    if (hasMore && pageDocs.length > 0) {
      const lastDoc = pageDocs[pageDocs.length - 1];
      const lastData = lastDoc.data();
      const lastCreatedAt = safeDateMillis(lastData.createdAt);
      nextCursor = btoa(`${lastCreatedAt},${lastDoc.id}`);
    }

    return c.json({
      success: true,
      delegates,
      items: delegates,
      hasMore,
      nextCursor
    });
  } catch (err: any) {
    console.error('[Worker Admin] Error in admin delegates:', err);
    return c.json({ success: false, error: err?.message || 'SERVER_ERROR' }, 500);
  }
});
}
