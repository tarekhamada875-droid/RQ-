
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Vehicle } from '../types';
import { listenerTracker } from '../utils/listenerTracker';

const mapTodayTransactions = (snapshot: any, today: string): any[] => snapshot.docs
  .map((doc: any) => ({ id: doc.id, ...doc.data() }))
  .filter((log: any) => log.timestamp && getCairoDateKey(safeDate(log.timestamp)) === today)
  .sort((a: any, b: any) => {
    const byTimestamp = safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime();
    return byTimestamp || String(a.id).localeCompare(String(b.id));
  })
  .slice(0, TODAY_ACTIVITY_LOG_LIMIT);
import { apiFetch } from '../api/apiClient';
import { safeDate } from '../utils';
import { generateIdempotencyKey } from '../types/apiContracts';

const TODAY_ACTIVITY_LOG_LIMIT = 200;

type TodayActivityLogSource = 'live' | 'one-shot';
type TodayActivityLogCallback = (logs: any[], error?: Error) => void;

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

function getCairoDateKey(date: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function getCairoDayStartTimestamp(date = new Date()): Date {
  try {
    const cairoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const startOfDay = new Date(`${cairoDateStr}T00:00:00+02:00`);
    return isNaN(startOfDay.getTime()) ? new Date(Date.now() - 24 * 3600 * 1000) : startOfDay;
  } catch {
    return new Date(Date.now() - 24 * 3600 * 1000);
  }
}

export const vehicleService = {
  checkInVehicle: async (garageId: string, vehicleData: any) => {
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
          idempotencyKey: generateIdempotencyKey('vehicle_checkin')
        }
      });
      return { success: true, data: data.data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
  
  checkOutVehicle: async (garageId: string, vehicleId: string, _cost: number, staffName?: string, _staffId?: string) => {
    try {
      const data = await apiFetch('/api/vehicles/check-out', {
        method: 'POST',
        body: {
          garageId,
          vehicleId,
          staffName,
          idempotencyKey: generateIdempotencyKey('vehicle_checkout')
        }
      });
      return { success: true, cost: data.data?.cost };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
  
  deleteVehicleWithRefund: async (garageId: string, vehicleId: string, refundAmount: number, _passedTodayYMD?: string, staffName?: string, _staffId?: string) => {
    try {
      await apiFetch('/api/vehicles/delete', {
        method: 'POST',
        body: {
          garageId,
          vehicleId,
          refundAmount,
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

  subscribeToActiveVehicles: (garageId: string, callback: (vehicles: Vehicle[]) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/active_vehicles`);
    const q = query(
      collection(db, `garages/${garageId}/vehicles`),
      where('status', '==', 'inside')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const vehicles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
      vehicles.sort((a, b) => safeDate(b.entryTime).getTime() - safeDate(a.entryTime).getTime());
      callback(vehicles);
    });

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  subscribeToTodayTransactions: (garageId: string, callback: TodayActivityLogCallback) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/today_transactions`);
    const today = getCairoDateKey();
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

    // The UI labels the daily report as a maximum of 200 activity records.
    const q = query(
      collection(db, 'activity_logs'),
      where('garageId', '==', garageId),
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

  getVehiclesByPlateOnce: async (garageId: string, plateNumberRaw: string): Promise<Vehicle[]> => {
    const q = query(
      collection(db, `garages/${garageId}/vehicles`),
      where('plateNumberRaw', '==', plateNumberRaw),
      limit(10)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vehicle));
  },

  getTodayTransactionsOnce: async (garageId: string): Promise<any[]> => {
    const today = getCairoDateKey();
    const startTime = getCairoDayStartTimestamp();
    const firestoreTimestamp = Timestamp.fromDate(startTime);

    try {
      const q = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
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
  }
};
