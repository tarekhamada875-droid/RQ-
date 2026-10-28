import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy, limit, startAfter, Timestamp } from 'firebase/firestore';
import { safeDate } from '../utils';
import { listenerTracker } from '../utils/listenerTracker';
import type { ActivityLog } from '../types';

export const adminActivityService = {
  // addActivityLog: removed. The /api/activity-logs/add endpoint always
  // returns 403 (SERVER_GENERATED_ONLY) and nobody calls this function.


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


  getPaginatedActivityLogs: async (pageSize = 20, lastDocRef?: any) => {
    try {
      let q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(pageSize));
      if (lastDocRef) {
        q = query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), startAfter(lastDocRef), limit(pageSize));
      }
      const snap = await getDocs(q);
      const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      return { 
        logs, 
        lastDoc: snap.docs[snap.docs.length - 1] || null,
        hasMore: snap.docs.length === pageSize
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'activity_logs');
      throw error;
    }
  },


  subscribeToGarageRechargeLogs: (garageId: string, callback: (logs: ActivityLog[]) => void, limitCount = 50, onError?: (err: any) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/recharge_logs`);
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
        where('actionType', '==', 'recharge'),
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
            .filter(log => log.actionType === 'recharge' || (log.plateNumber && (log.plateNumber.includes('شحن') || log.plateNumber.includes('تفعيل'))));
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
        where('plateNumber', '==', rawPlate),
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

  // Announcements
};
