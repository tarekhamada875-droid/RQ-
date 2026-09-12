
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Vehicle } from '../types';
import { listenerTracker } from '../utils/listenerTracker';
import { apiFetch } from '../api/apiClient';
import { safeDate } from '../utils';

function getCairoDateKey(date: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function getCairoDayStartTimestamp(date = new Date()): Date {
  try {
    const cairoDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    const startOfDay = new Date(`${cairoDateStr}T00:00:00+02:00`);
    return isNaN(startOfDay.getTime()) ? new Date(Date.now() - 24 * 3600 * 1000) : startOfDay;
  } catch (e) {
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
          staffName: vehicleData.staffName
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
          staffName
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
          staffName
        }
      });
      return true;
    } catch (err: any) {
      if (err.message === 'reached_daily_deletion_limit') {
        throw new Error('reached_daily_deletion_limit');
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

  subscribeToTodayTransactions: (garageId: string, callback: (logs: any[]) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/today_transactions`);
    const today = getCairoDateKey();
    const startTime = getCairoDayStartTimestamp();
    const firestoreTimestamp = Timestamp.fromDate(startTime);

    const handleSnapshot = (snapshot: any) => {
      const logs = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      const todayLogs = logs.filter((log: any) => {
        if (!log.timestamp) return false;
        const d = safeDate(log.timestamp);
        return getCairoDateKey(d) === today;
      });
      todayLogs.sort((a: any, b: any) => {
        const ta = safeDate(a.timestamp).getTime();
        const tb = safeDate(b.timestamp).getTime();
        return tb - ta;
      });
      callback(todayLogs);
    };

    // Bounded query filtered by startTime AND limited to 200 items max
    let q = query(
      collection(db, 'activity_logs'),
      where('garageId', '==', garageId),
      where('timestamp', '>=', firestoreTimestamp),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    let activeSubUnsub: (() => void) | null = null;
    activeSubUnsub = onSnapshot(q, handleSnapshot, (err) => {
      console.warn('[vehicleService] subscribeToTodayTransactions index fallback:', err);
      // Fallback query if composite index is building/missing: limit to 200
      const fallbackQ = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('timestamp', '>=', firestoreTimestamp),
        limit(200)
      );
      activeSubUnsub = onSnapshot(fallbackQ, handleSnapshot, (fallbackErr) => {
        console.error('[vehicleService] subscribeToTodayTransactions error:', fallbackErr);
        callback([]);
      });
    });

    return () => {
      if (activeSubUnsub) activeSubUnsub();
      trackerUnsub();
    };
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
        limit(200)
      );
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      return logs.filter(log => {
        if (!log.timestamp) return false;
        const d = safeDate(log.timestamp);
        return getCairoDateKey(d) === today;
      }).sort((a, b) => {
        const ta = safeDate(a.timestamp).getTime();
        const tb = safeDate(b.timestamp).getTime();
        return tb - ta;
      });
    } catch (err) {
      console.warn('[vehicleService] getTodayTransactionsOnce fallback:', err);
      const fallbackQ = query(
        collection(db, 'activity_logs'),
        where('garageId', '==', garageId),
        where('timestamp', '>=', firestoreTimestamp),
        limit(200)
      );
      const snapshot = await getDocs(fallbackQ);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      return logs.filter(log => {
        if (!log.timestamp) return false;
        const d = safeDate(log.timestamp);
        return getCairoDateKey(d) === today;
      }).sort((a, b) => {
        const ta = safeDate(a.timestamp).getTime();
        const tb = safeDate(b.timestamp).getTime();
        return tb - ta;
      });
    }
  }
};
