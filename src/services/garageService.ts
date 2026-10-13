import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { 
  collection, 
  query, 
  where, 
  or,
  onSnapshot, 
  doc, 
  getDoc,
  getDocs, 
  runTransaction, 
  orderBy, 
  limit, 
  serverTimestamp, 
  startAfter
} from 'firebase/firestore';
import type { Garage } from '../types';
import { withRetry, sortGaragesNewestFirst } from '../utils';
import { validateGarageCreation } from '../domain/garage/validation';
import { listenerTracker } from '../utils/listenerTracker';
import { generateIdempotencyKey } from '../types/apiContracts';

export type GarageDeletionProgress = {
  phase: 'preparing' | 'deleting' | 'finalizing' | 'complete' | 'failed';
  processed: number;
  total?: number;
  percentage?: number;
};

export type GarageDeletionStatus = {
  status: 'not_started' | 'running' | 'completed' | 'failed' | 'stale' | 'unknown';
  phase?: string;
  processedRecords: number;
  errorCode: string | null;
  retryable: boolean;
};

export interface GarageDashboardSummary {
  activeVehicleCount: number;
  entriesToday: number;
  exitsToday: number;
  grossRevenue: number;
  refundTotal: number;
  netRevenue: number;
  projectionVersion: number;
  dateId?: string;
  rebuiltAt?: string;
  source?: 'live_projection_buckets' | 'rebuild';
}

export function isFreshGarageDashboardSummary(summary: GarageDashboardSummary | null | undefined, now = Date.now(), maxAgeMs = 5 * 60 * 1000): summary is GarageDashboardSummary {
  if (!summary?.dateId || !summary.rebuiltAt) return false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const rebuiltAt = Date.parse(summary.rebuiltAt);
  return summary.dateId === today && Number.isFinite(rebuiltAt) && now - rebuiltAt >= 0 && now - rebuiltAt <= maxAgeMs;
}

const mapGaragePage = (snapshot: any, pageSize: number): {
  garages: Garage[];
  lastDoc: any;
  hasMore: boolean;
} => {
  const rawGarages: Garage[] = snapshot.docs.map((garageDoc: any) => ({
    id: garageDoc.id,
    ...garageDoc.data()
  } as Garage));
  return {
    garages: sortGaragesNewestFirst(rawGarages),
    lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
    hasMore: snapshot.docs.length === pageSize
  };
};

export const garageService = {
  getDashboardSummary: async (garageId: string): Promise<GarageDashboardSummary> => {
    const response = await apiFetch<{ data: { summary: GarageDashboardSummary } }>(`/api/garages/${encodeURIComponent(garageId)}/dashboard-summary`);
    return response.data.summary;
  },

  subscribeToGarages: (callback: (garages: Garage[]) => void) => {
    const trackerUnsub = listenerTracker.register('garages');
    let timeoutId: any = null;
    let latestGarages: Garage[] | null = null;
    let isFirst = true;

    const emit = () => {
      if (latestGarages) {
        callback(latestGarages);
      }
    };

    const q = query(collection(db, 'garages'));
    const unsub = onSnapshot(q, (snapshot) => {
      const rawGarages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Garage));
      latestGarages = sortGaragesNewestFirst(rawGarages);
      if (isFirst) {
        isFirst = false;
        emit();
      } else {
        // Throttle high-frequency updates (e.g. 10-30 transactions/sec across 1000 garages) to prevent UI thread lockup
        if (!timeoutId) {
          timeoutId = setTimeout(() => {
            timeoutId = null;
            emit();
          }, 2000);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'garages'));

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      unsub();
      trackerUnsub();
    };
  },

  subscribeToDelegateGarages: (delegateId: string, callback: (garages: Garage[]) => void) => {
    if (!delegateId) {
      callback([]);
      return () => {};
    }
    const trackerUnsub = listenerTracker.register(`delegates/${delegateId}/garages`);
    const q = query(
      collection(db, 'garages'),
      or(
        where('createdByDelegateId', '==', delegateId),
        where('referrerId', '==', delegateId)
      )
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const rawGarages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Garage));
      callback(sortGaragesNewestFirst(rawGarages));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'garages/delegate'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  getAdminGaragesPage: async (pageSize = 50, lastDocRef: any = null) => {
    try {
      let q = query(
        collection(db, 'garages'),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );

      if (lastDocRef) {
        q = query(
          collection(db, 'garages'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDocRef),
          limit(pageSize)
        );
      }

      return mapGaragePage(await getDocs(q), pageSize);
    } catch {
      try {
        let fallbackQ = query(
          collection(db, 'garages'),
          limit(pageSize)
        );
        if (lastDocRef) {
          fallbackQ = query(
            collection(db, 'garages'),
            startAfter(lastDocRef),
            limit(pageSize)
          );
        }
        return mapGaragePage(await getDocs(fallbackQ), pageSize);
      } catch (fallbackErr) {
        console.warn('Failed to load admin garage page:', fallbackErr);
        handleFirestoreError(fallbackErr, OperationType.LIST, 'garages/admin-page');
        throw fallbackErr;
      }
    }
  },

  subscribeToGarage: (garageId: string, callback: (garage: Garage) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}`);
    const unsub = onSnapshot(doc(db, 'garages', garageId), (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as Garage);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `garages/${garageId}`));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  createGarage: async (data: any): Promise<{ success: boolean; id?: string; error?: string }> => {
    const validation = validateGarageCreation(data);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(' — ') };
    }

    try {
      const json = await apiFetch('/api/garages/create', {
        method: 'POST',
        body: data,
        timeoutMs: 60_000
      });

      return { success: true, id: json.id };
    } catch (err: any) {
      if (err.message === 'PIN_ALREADY_TAKEN') {
        // Fallback or detailed error handled by server, we can match and format
        return { success: false, error: 'رمز الدخول مستخدم بالفعل' };
      }
      return { success: false, error: err.message || 'حدث خطأ أثناء إنشاء الجراج' };
    }
  },

  useReferralRewardDays: async (garageId: string): Promise<{ success: boolean; daysClaimed?: number; error?: string }> => {
    try {
      const json = await apiFetch('/api/transactions/use-referral-reward', {
        method: 'POST',
        body: { garageId }
      });

      return { success: true, daysClaimed: json.daysClaimed };
    } catch (err: any) {
      if (err.message === 'NO_REFERRAL_REWARDS_AVAILABLE') {
        return { success: false, error: 'لا يوجد رصيد أيّام مجانيّة للاستخدام' };
      }
      return { success: false, error: err.message || 'حدث خطأ أثناء استخدام أيام المكافأة' };
    }
  },

  updateGarage: async (id: string, data: Partial<Garage>) => {
    try {
      if ('balanceExpiry' in data && data.balanceExpiry === null && data.status === 'approved') {
        throw new Error('لا يمكن حذف تاريخ انتهاء الاشتراك لجراج مفعل');
      }
      const newPin = data.pin || (data as any).ownerPin;
      if (newPin) {
        await apiFetch('/api/people/update-pin', {
          method: 'POST',
          body: { entityType: 'garages', entityId: id, newPin }
        });
      }

      const payload: any = { ...data };
      delete payload.pin;
      delete payload.ownerPin;

      if (newPin) {
        payload.currentSessionId = null;
      }

      if (Object.keys(payload).length > 0) {
        await apiFetch('/api/garages/update', {
          method: 'POST',
          body: { id, ...payload }
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${id}`);
      throw error;
    }
  },

  getGarageById: async (id: string) => {
    try {
      const snapshot = await getDoc(doc(db, 'garages', id));
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as Garage;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `garages/${id}`);
      throw error;
    }
  },

  claimOrRefreshGarageSession: async (
    garageId: string,
    sessionId: string,
    _serverTimeOffset = 0
  ) => {
    const garageRef = doc(db, 'garages', garageId);
    const sessionRef = doc(db, 'garage_sessions', garageId);

    return withRetry(() => runTransaction(db, async (transaction) => {
      const garageSnap = await transaction.get(garageRef);
      if (!garageSnap.exists()) throw new Error('GARAGE_NOT_FOUND');

      const data = garageSnap.data();

      transaction.update(garageRef, {
        currentSessionId: sessionId,
        lastActive: serverTimestamp(),
      });
      transaction.set(sessionRef, {
        garageId,
        sessionId,
        uid: auth.currentUser?.uid || null,
        lastActive: serverTimestamp(),
      }, { merge: true });

      return { ...data, id: garageSnap.id, currentSessionId: sessionId };
    }));
  },

  recalculateCarsInside: async (garageId: string): Promise<number> => {
    try {
      const res = await apiFetch('/api/garages/recalculate-cars-inside', {
        method: 'POST',
        body: { garageId }
      });
      return res.count || 0;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}/recalculateCarsInside`);
      throw error;
    }
  },

  getGarageDeletionStatus: async (id: string): Promise<GarageDeletionStatus> => {
    try {
      const status = await apiFetch<{
        status?: string;
        phase?: string;
        processedRecords?: number;
        errorCode?: string | null;
        retryable?: boolean;
      }>(`/api/garages/delete-status?garageId=${encodeURIComponent(id)}`);
      const knownStatuses = ['running', 'completed', 'failed', 'stale'] as const;
      const resolvedStatus = knownStatuses.includes(status.status as typeof knownStatuses[number])
        ? status.status as typeof knownStatuses[number]
        : 'unknown';
      return {
        status: resolvedStatus,
        phase: status.phase,
        processedRecords: Math.max(0, Number(status.processedRecords) || 0),
        errorCode: typeof status.errorCode === 'string' ? status.errorCode : null,
        retryable: status.retryable === true
      };
    } catch (error: any) {
      if (error?.code === 'DELETION_JOB_NOT_FOUND' || error?.message === 'DELETION_JOB_NOT_FOUND') {
        return { status: 'not_started', processedRecords: 0, errorCode: null, retryable: false };
      }
      throw error;
    }
  },

  deleteGarage: async (
    id: string,
    onProgress?: (progress: GarageDeletionProgress) => void
  ) => {
    try {
      onProgress?.({ processed: 0, phase: 'preparing' });
      const started = await apiFetch<{
        success: boolean;
        status?: 'running' | 'completed';
        alreadyDeleted?: boolean;
        processedRecords?: number;
        jobToken?: string;
      }>('/api/garages/delete', {
        method: 'POST',
        body: { garageId: id },
        timeoutMs: 15_000
      });

      if (started.alreadyDeleted || started.status === 'completed') {
        onProgress?.({ processed: Number(started.processedRecords) || 0, phase: 'complete' });
        return true;
      }
      if (!started.jobToken) throw new Error('GARAGE_DELETION_JOB_TOKEN_MISSING');

      const deadline = Date.now() + 6 * 60_000;
      let step: {
        success: boolean;
        status: string;
        phase?: string;
        processedRecords?: number;
        errorCode?: string | null;
      };
      do {
        step = await apiFetch('/api/garages/delete-step', {
          method: 'POST',
          body: { garageId: id, jobToken: started.jobToken },
          timeoutMs: 15_000
        });
        const processed = Number(step.processedRecords) || 0;
        if (step.status === 'completed') {
          onProgress?.({ processed, phase: 'complete' });
          return true;
        }
        if (step.status === 'failed' || step.status === 'stale') {
          onProgress?.({ processed, phase: 'failed' });
          throw new Error(step.status === 'stale' ? 'GARAGE_DELETION_STALE' : (step.errorCode || 'GARAGE_DELETION_FAILED'));
        }
        if (step.status !== 'running') throw new Error('GARAGE_DELETION_STATUS_UNKNOWN');
        const phase = step.phase === 'finalizing' ? 'finalizing' : 'deleting';
        onProgress?.({ processed, phase });
        if (Date.now() >= deadline) throw new Error('GARAGE_DELETION_STILL_RUNNING');
        await new Promise((resolve) => setTimeout(resolve, 150));
      } while (Date.now() < deadline);

      throw new Error('GARAGE_DELETION_STILL_RUNNING');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `garages/${id}`);
      throw error;
    }
  },

  adminTopupGarageBalance: async (garageId: string, amount: number) => {
    try {
      const data = await apiFetch('/api/transactions/admin-topup-balance', {
        method: 'POST',
        body: { garageId, amount, idempotencyKey: generateIdempotencyKey('admin_wallet_topup') }
      });
      return data.data;
    } catch (error) {
      console.error('[GarageService] adminTopupGarageBalance error:', error);
      throw error;
    }
  },

  garageSelfSubscribe: async (garageId: string, packageId: string, packageData?: any) => {
    try {
      const data = await apiFetch('/api/transactions/garage-self-subscribe', {
        method: 'POST',
        body: { garageId, packageId, packageData, idempotencyKey: generateIdempotencyKey('garage_self_subscribe') }
      });
      return data.data;
    } catch (error) {
      console.error('[GarageService] garageSelfSubscribe error:', error);
      throw error;
    }
  }
};
