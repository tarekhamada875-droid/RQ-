
import { collection, doc, query, where, onSnapshot, getDoc, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Vehicle } from '../types';
import { listenerTracker } from '../utils/listenerTracker';
import { apiFetch } from '../api/apiClient';
import { safeDate } from '../utils/dates';
import { getCairoDateKey, getCairoDayBounds } from '../../server/projections';
import { generateIdempotencyKey } from '../types/apiContracts';

const TODAY_ACTIVITY_LOG_LIMIT = 50;
const TODAY_REPORT_ACTION = 'check_out';

type TodayActivityLogSource = 'live' | 'one-shot';
type TodayActivityLogCallback = (logs: any[], error?: Error) => void;

const mapTodayTransactions = (snapshot: any, today: string): any[] => snapshot.docs
  .map((doc: any) => ({ id: doc.id, ...doc.data() }))
  .filter((log: any) => log.actionType === TODAY_REPORT_ACTION)
  .filter((log: any) => log.timestamp && getCairoDateKey(safeDate(log.timestamp)) === today)
  .sort((a: any, b: any) => {
    const byTimestamp = safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime();
    return byTimestamp || String(a.id).localeCompare(String(b.id));
  })
  .slice(0, TODAY_ACTIVITY_LOG_LIMIT);

function isMissingActivityLogIndexError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return (code === 'failed-precondition' && /index/i.test(message)) ||
    /(?:requires|missing)\s+(?:a\s+|the\s+)?(?:composite\s+)?index/i.test(message);
}

function makeActivityLogUnavailableError(cause: unknown): Error & { code: string } {
  return Object.assign(new Error('ACTIVITY_LOGS_UNAVAILABLE', { cause }), {
    code: 'ACTIVITY_LOGS_UNAVAILABLE'
  });
}

function recordActivityLogIndexFallback(source: TodayActivityLogSource, error: unknown): void {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? 'unknown')
    : 'unknown';
  // Stable, non-sensitive event name makes missing-index fallback occurrences countable.
  console.warn('[vehicleService] activity_logs_index_fallback', {
    event: 'activity_logs_index_fallback',
    source,
    code
  });
}

function recordActivityLogQueryFailure(source: TodayActivityLogSource, error: unknown): void {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? 'unknown')
    : 'unknown';
  console.error('[vehicleService] activity_logs_query_unavailable', {
    event: 'activity_logs_query_unavailable',
    source,
    code
  });
}

function getCairoDayStartTimestamp(date = new Date()): Date {
  try {
    // Audit fix (2026-11-21): this used to build the day start with a
    // hardcoded +02:00 offset. Egypt observes daylight saving (+03:00, ~April
    // to October), so during summer the window started at 01:00 local — cars
    // checked out between 00:00 and 01:00 silently vanished from today's
    // queries and reports. The shared Cairo helper resolves the real
    // Africa/Cairo offset for the date (DST-safe).
    return getCairoDayBounds(getCairoDateKey(date)).start;
  } catch {
    return new Date(Date.now() - 24 * 3600 * 1000);
  }
}

export const vehicleService = {
  checkInVehicle: async (garageId: string, vehicleData: any, idempotencyKey?: string) => {
    try {
      const data = await apiFetch('/api/vehicles/check-in', {
        method: 'POST',
        body: {
          garageId,
          plateNumber: vehicleData.plateNumber,
          plateRaw: vehicleData.plateNumberRaw || vehicleData.id,
          type: vehicleData.type,
          isSubscriber: vehicleData.isSubscriber,
          staffName: vehicleData.staffName,
          // accept a caller-provided idempotency key so retries can
          // reuse the same key. If none provided, generate a fresh one (legacy).
          idempotencyKey: idempotencyKey || generateIdempotencyKey('vehicle_checkin')
        }
      });
      return { success: true, data: data.data };
    } catch (err: any) {
      // OFFLINE STEP 2: preserve the ApiError code so the envelope-flush loop
      // can tell network-shaped failures (NETWORK_ERROR / API_TIMEOUT → keep
      // the envelope, retry later) from server business rejections
      // (INSUFFICIENT_*, ALREADY_INSIDE… → park the envelope as rejected).
      return { success: false, error: err.message, code: err?.code };
    }
  },
  
  checkOutVehicle: async (garageId: string, vehicleId: string, _cost: number, staffName?: string, _staffId?: string, idempotencyKey?: string) => {
    try {
      const data = await apiFetch('/api/vehicles/check-out', {
        method: 'POST',
        body: {
          garageId,
          vehicleId,
          staffName,
          // accept a caller-provided idempotency key so retries can
          // reuse the same key. If none provided, generate a fresh one (legacy).
          idempotencyKey: idempotencyKey || generateIdempotencyKey('vehicle_checkout')
        }
      });
      return {
        success: true,
        cost: data.data?.cost,
        carsInside: data.data?.carsInside,
        totalVehiclesOut: data.data?.totalVehiclesOut,
        todayRevenue: data.data?.todayRevenue,
        totalRevenue: data.data?.totalRevenue,
        todayCount: data.data?.todayCount,
        lastTransactionDate: data.data?.lastTransactionDate
      };
    } catch (err: any) {
      // OFFLINE STEP 2: same code preservation as check-in (see above).
      return { success: false, error: err.message, code: err?.code };
    }
  },
  
  deleteVehicle: async (garageId: string, vehicleId: string, _passedTodayYMD?: string, staffName?: string, _staffId?: string) => {
    try {
      await apiFetch('/api/vehicles/delete', {
        method: 'POST',
        body: {
          garageId,
          vehicleId,
          refundAmount: 0,
          staffName,
          idempotencyKey: generateIdempotencyKey('vehicle_delete')
        }
      });
      return true;
    } catch (err: any) {
      if (err.message === 'reached_daily_deletion_limit') {
        throw new Error('reached_daily_deletion_limit', { cause: err });
      }
      throw err;
    }
  },

  /**
   * PR2 (2026-11-23): one-shot SINGLE-READ vehicle lookup by document ID.
   * The vehicle doc ID IS the normalized plate raw (the check-in route
   * writes garages/{garageId}/vehicles/{plateRaw}), so this is exactly
   * 1 Firestore read with no query and no index.
   *
   * Replaces the always-on subscribeToActiveVehicles stream: the
   * RegistrationCard calls this (debounced) when a valid plate is typed to
   * decide between the red "إصدار فاتورة خروج" button (status === 'inside')
   * and the ساعة/مبيت buttons (no doc or status === 'outside').
   *
   * Returns the raw doc regardless of status — the caller filters.
   * Returns null when the plate has never been registered in this garage.
   */
  getVehicleDocOnce: async (garageId: string, plateNumberRaw: string): Promise<Vehicle | null> => {
    const ref = doc(db, `garages/${garageId}/vehicles/${plateNumberRaw}`);
    const snap = await getDoc(ref);
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as Vehicle) : null;
  },

  subscribeToTodayTransactions: (garageId: string, callback: TodayActivityLogCallback) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/today_transactions`);
    const today = getCairoDateKey(new Date());
    const startTime = getCairoDayStartTimestamp();
    const firestoreTimestamp = Timestamp.fromDate(startTime);
    let isClosed = false;
    let primaryUnsub: (() => void) | null = null;
    let fallbackUnsub: (() => void) | null = null;

    const emit = (logs: any[], error?: Error) => {
      if (!isClosed) callback(logs, error);
    };
    const handleSnapshot = (snapshot: any) => {
      emit(mapTodayTransactions(snapshot, today));
    };

    // The UI labels the daily report as a maximum of 50 activity records.
    const q = query(
      collection(db, 'activity_logs'),
      where('garageId', '==', garageId),
      where('actionType', '==', TODAY_REPORT_ACTION),
      where('timestamp', '>=', firestoreTimestamp),
      orderBy('timestamp', 'desc'),
      limit(TODAY_ACTIVITY_LOG_LIMIT)
    );

    const unsubscribe = () => {
      if (isClosed) return;
      isClosed = true;
      primaryUnsub?.();
      fallbackUnsub?.();
      trackerUnsub();
    };

    const startFallback = (indexError: unknown) => {
      recordActivityLogIndexFallback('live', indexError);
      // Keep the compatibility path bounded even when the composite day index is unavailable.
      // The single-field timestamp ordering preserves newest-first selection before local
      // Cairo-day filtering, while avoiding an unbounded live listener.
      const fallbackQ = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('actionType', '==', TODAY_REPORT_ACTION),
        orderBy('timestamp', 'desc'),
        limit(TODAY_ACTIVITY_LOG_LIMIT)
      );
      fallbackUnsub = onSnapshot(fallbackQ, handleSnapshot, (fallbackError) => {
        if (isClosed) return;
        recordActivityLogQueryFailure('live', fallbackError);
        emit([], makeActivityLogUnavailableError(fallbackError));
      });
    };

    primaryUnsub = onSnapshot(q, handleSnapshot, (error) => {
      if (isClosed) return;
      if (isMissingActivityLogIndexError(error)) {
        startFallback(error);
        return;
      }
      recordActivityLogQueryFailure('live', error);
      emit([], makeActivityLogUnavailableError(error));
    });

    return unsubscribe;
  },

  getTodayTransactionsOnce: async (garageId: string): Promise<any[]> => {
    const today = getCairoDateKey(new Date());
    const startTime = getCairoDayStartTimestamp();
    const firestoreTimestamp = Timestamp.fromDate(startTime);

    try {
      const q = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('actionType', '==', TODAY_REPORT_ACTION),
        where('timestamp', '>=', firestoreTimestamp),
        orderBy('timestamp', 'desc'),
        limit(TODAY_ACTIVITY_LOG_LIMIT)
      );
      return mapTodayTransactions(await getDocs(q), today);
    } catch (primaryError) {
      if (!isMissingActivityLogIndexError(primaryError)) {
        recordActivityLogQueryFailure('one-shot', primaryError);
        throw makeActivityLogUnavailableError(primaryError);
      }
      recordActivityLogIndexFallback('one-shot', primaryError);
      // Match the live fallback with a bounded newest-first compatibility query.
      const fallbackQ = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('actionType', '==', TODAY_REPORT_ACTION),
        orderBy('timestamp', 'desc'),
        limit(TODAY_ACTIVITY_LOG_LIMIT)
      );
      try {
        return mapTodayTransactions(await getDocs(fallbackQ), today);
      } catch (fallbackError) {
        recordActivityLogQueryFailure('one-shot', fallbackError);
        throw makeActivityLogUnavailableError(fallbackError);
      }
    }
  },

  /**
   * Fetch total revenue for the last 30 days from the precomputed
   * `daily_stats` collection. Each day has a `revenue` field written
   * by the Worker at check-out time.
   *
   * Reads 1 query (up to 30 docs) — much cheaper than querying 30 days
   * of activity logs directly (~1,500 reads). The daily_stats docs are
   * already computed and maintained server-side.
   *
   * Returns { totalRevenue, daysWithData } where daysWithData is the
   * number of days that had at least one checkout.
   */
  getMonthlyRevenue: async (garageId: string): Promise<{ totalRevenue: number; daysWithData: number }> => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoKey = getCairoDateKey(thirtyDaysAgo);

    const q = query(
      collection(db, 'garages', garageId, 'daily_stats'),
      where('dateId', '>=', thirtyDaysAgoKey),
      orderBy('dateId', 'desc'),
    );

    try {
      const snapshot = await getDocs(q);
      let totalRevenue = 0;
      let daysWithData = 0;
      snapshot.forEach((doc: any) => {
        const data = doc.data();
        const rev = Number(data.revenue || 0);
        if (rev > 0 || Number(data.count || 0) > 0) {
          daysWithData++;
        }
        totalRevenue += rev;
      });
      return { totalRevenue, daysWithData };
    } catch (error) {
      console.error('[Monthly Revenue] Failed to fetch daily_stats:', error);
      throw error;
    }
  }
};
