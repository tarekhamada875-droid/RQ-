import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { safeDate } from '../utils/dates';
import { listenerTracker } from '../utils/listenerTracker';
import type { ActivityLog } from '../types';

/**
 * Per-garage daily report — summary + first 200 activity_logs for a specific
 * date. Read cost: ~1 read for daily_stats + 1 read for the garage doc name +
 * up to 200 reads for activity_logs. Total ~3-201 reads per day-view.
 *
 * No writes. No live listeners. One-shot read with 5-minute client-side
 * in-memory cache to avoid refetching the same garage+date.
 */
const DAILY_REPORT_LOG_LIMIT = 200;
const dailyReportCache = new Map<string, { data: GarageDailyReport; fetchedAt: number }>();
const DAILY_REPORT_CACHE_MS = 5 * 60 * 1000;

export interface GarageDailySummary {
  dateId: string;
  entries: number;
  exits: number;
  revenue: number;
  hasReport: boolean;
}

export interface GarageDailyReport {
  garageId: string;
  garageName: string;
  dateId: string;
  summary: GarageDailySummary;
  logs: ActivityLog[];
  truncated: boolean; // true if logs.length === DAILY_REPORT_LOG_LIMIT (more exist)
}

function getCairoDayBounds(dateId: string): { start: Date; end: Date } {
  // dateId is YYYY-MM-DD already in Cairo timezone
  const start = new Date(`${dateId}T00:00:00+02:00`);
  const end = new Date(`${dateId}T23:59:59.999+02:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    // Fallback: if dateId is malformed, return today's bounds
    const now = new Date();
    return { start: now, end: now };
  }
  return { start, end };
}

export const adminActivityService = {
  /**
   * Fetch a per-garage daily report. Uses a 5-minute in-memory cache to
   * avoid refetching the same garage+date when the user toggles between
   * garages or reopens the modal.
   */
  getGarageDailyReport: async (
    garageId: string,
    garageName: string,
    dateId: string
  ): Promise<GarageDailyReport> => {
    const cacheKey = `${garageId}:${dateId}`;
    const cached = dailyReportCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < DAILY_REPORT_CACHE_MS) {
      return cached.data;
    }

    const { start, end } = getCairoDayBounds(dateId);
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);

    // Parallel: 1 read for daily_stats + 1 paginated read for activity_logs.
    // The activity_logs query returns a normalized array of {id, ...data} in
    // both the primary and fallback paths so the rest of the function can
    // treat them identically.
    const [dailyStatsSnap, normalizedLogs] = await Promise.all([
      getDocs(query(
        collection(db, `garages/${garageId}/daily_stats`),
        where('__name__', '==', dateId)
      )).then(snap => snap.docs[0]?.data() || null).catch(() => null),
      (async (): Promise<ActivityLog[]> => {
        try {
          const snap = await getDocs(query(
            collection(db, 'activity_logs'),
            where('garageId', '==', garageId),
            where('timestamp', '>=', startTs),
            where('timestamp', '<=', endTs),
            orderBy('timestamp', 'desc'),
            limit(DAILY_REPORT_LOG_LIMIT)
          ));
          return snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
        } catch (primaryErr) {
          // Composite index fallback: query by garageId only, filter by date client-side.
          console.warn('[adminActivityService] daily-report activity_logs index fallback:', primaryErr);
          const fallbackSnap = await getDocs(query(
            collection(db, 'activity_logs'),
            where('garageId', '==', garageId),
            orderBy('timestamp', 'desc'),
            limit(DAILY_REPORT_LOG_LIMIT * 2) // fetch 2x to compensate for client-side date filtering
          ));
          const startMs = start.getTime();
          const endMs = end.getTime();
          return fallbackSnap.docs
            .filter(d => {
              const t = safeDate(d.data()?.timestamp).getTime();
              return t >= startMs && t <= endMs;
            })
            .slice(0, DAILY_REPORT_LOG_LIMIT)
            .map(d => ({ id: d.id, ...d.data() } as ActivityLog));
        }
      })()
    ]);

    const dailyStatsData: any = dailyStatsSnap || {};
    const summary: GarageDailySummary = {
      dateId,
      entries: Number(dailyStatsData.count || 0),
      exits: Number(dailyStatsData.exitsCount || 0),
      revenue: Number(dailyStatsData.revenue || 0),
      hasReport: Boolean(dailyStatsData.reportAggregateVersion === 1 && dailyStatsData.report),
    };

    const logs: ActivityLog[] = normalizedLogs;
    const truncated = logs.length === DAILY_REPORT_LOG_LIMIT;

    const report: GarageDailyReport = {
      garageId,
      garageName,
      dateId,
      summary,
      logs,
      truncated,
    };

    dailyReportCache.set(cacheKey, { data: report, fetchedAt: Date.now() });
    return report;
  },

  /** Clear the in-memory cache for a specific garage+date (or all if no args). */
  clearDailyReportCache: (garageId?: string, dateId?: string): void => {
    if (!garageId && !dateId) {
      dailyReportCache.clear();
      return;
    }
    const prefix = garageId && dateId ? `${garageId}:${dateId}` : (garageId ? garageId : `:${dateId}`);
    for (const key of [...dailyReportCache.keys()]) {
      if (key.startsWith(prefix) || key.endsWith(prefix)) {
        dailyReportCache.delete(key);
      }
    }
  },

  getActivityLogsSince: async (sinceDate: Date, maxCount = 2000): Promise<ActivityLog[]> => {
    const boundedMaxCount = Math.min(Math.max(Math.floor(maxCount) || 1, 1), 5000);
    try {
      const firestoreTimestamp = Timestamp.fromDate(sinceDate);
      const q = query(
        collection(db, 'activity_logs'),
        where('timestamp', '>=', firestoreTimestamp),
        orderBy('timestamp', 'desc'),
        limit(boundedMaxCount)
      );
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
    } catch (error) {
      console.warn('[adminService] getActivityLogsSince index fallback:', error);
      const fallbackQ = query(
        collection(db, 'activity_logs'),
        orderBy('timestamp', 'desc'),
        limit(boundedMaxCount)
      );
      const snap = await getDocs(fallbackQ);
      const sinceMs = sinceDate.getTime();
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      return logs.filter(log => safeDate(log.timestamp).getTime() >= sinceMs);
    }
  },

  subscribeToCreditGrantLogs: (garageId: string, callback: (logs: ActivityLog[]) => void, limitCount = 50, onError?: (err: any) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/credit_grant_logs`);
    let primaryUnsub: (() => void) | undefined;
    let fallbackUnsub: (() => void) | undefined;
    let isClosed = false;

    const unsubscribe = () => {
      if (isClosed) return;
      isClosed = true;

      const primary = primaryUnsub;
      const fallback = fallbackUnsub;
      primaryUnsub = undefined;
      fallbackUnsub = undefined;

      try {
        primary?.();
      } finally {
        try {
          fallback?.();
        } finally {
          trackerUnsub();
        }
      }
    };

    try {
      const resultLimit = Math.max(0, Math.floor(limitCount));
      const fetchLimit = Math.max(resultLimit, 1);
      const q = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('actionType', '==', 'credit_grant'),
        orderBy('timestamp', 'desc'),
        limit(fetchLimit)
      );
      primaryUnsub = onSnapshot(q, (snapshot) => {
        if (isClosed) return;
        const data = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
        data.sort((a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime());
        callback(data.slice(0, resultLimit));
      }, (err) => {
        if (isClosed || fallbackUnsub) return;
        console.warn('Targeted recharge query fallback needed:', err);
        const fallbackQ = query(
          collection(db, 'activity_logs'),
          where('garageId', '==', garageId),
          orderBy('timestamp', 'desc'),
          limit(100)
        );
        fallbackUnsub = onSnapshot(fallbackQ, (snapshot) => {
          if (isClosed) return;
          const data = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog))
            .filter(log => log.actionType === 'credit_grant' || (log.plateNumber && (log.plateNumber.includes('شحن') || log.plateNumber.includes('تفعيل'))));
          data.sort((a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime());
          callback(data.slice(0, resultLimit));
        }, (fallbackErr) => {
          if (isClosed) return;
          handleFirestoreError(fallbackErr, OperationType.LIST, 'activity_logs');
          if (onError) onError(fallbackErr);
          else callback([]);
        });
        if (isClosed) {
          const lateFallbackUnsub = fallbackUnsub;
          fallbackUnsub = undefined;
          lateFallbackUnsub?.();
        }
      });

      if (isClosed) {
        const latePrimaryUnsub = primaryUnsub;
        primaryUnsub = undefined;
        latePrimaryUnsub?.();
      }

      return unsubscribe;
    } catch (err: any) {
      unsubscribe();
      handleFirestoreError(err, OperationType.LIST, 'activity_logs');
      if (onError) onError(err);
      else callback([]);
      return unsubscribe;
    }
  },

  getSystemLogsByPlateOnce: async (rawPlate: string): Promise<ActivityLog[]> => {
    try {
      const q = query(
        collection(db, 'activity_logs'),
        where('plateNumberRaw', '==', rawPlate),
        limit(50)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      }
      return [];
    } catch (err) {
      console.error('Error fetching activity logs by plate:', err);
      return [];
    }
  },
};
