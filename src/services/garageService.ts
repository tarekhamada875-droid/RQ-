import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { 
  collection, 
  query, 
  where, 
  or,
  onSnapshot, 
  updateDoc, 
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
import { withRetry } from '../utils';
import { validateGarageCreation } from '../domain/garage/validation';
import { listenerTracker } from '../utils/listenerTracker';

export type GarageDeletionProgress = {
  phase: 'preparing' | 'deleting' | 'finalizing' | 'complete';
  total: number;
  processed: number;
  percentage: number;
};

export const garageService = {
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
      latestGarages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Garage));
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
      const garages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Garage));
      callback(garages);
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
        orderBy('name'),
        limit(pageSize)
      );

      if (lastDocRef) {
        q = query(
          collection(db, 'garages'),
          orderBy('name'),
          startAfter(lastDocRef),
          limit(pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const garages = snapshot.docs.map(garageDoc => ({
        id: garageDoc.id,
        ...garageDoc.data()
      } as Garage));

      return {
        garages,
        lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
        hasMore: snapshot.docs.length === pageSize
      };
    } catch (error) {
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
        const snapshot = await getDocs(fallbackQ);
        const garages = snapshot.docs.map(garageDoc => ({
          id: garageDoc.id,
          ...garageDoc.data()
        } as Garage));

        return {
          garages,
          lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
          hasMore: snapshot.docs.length === pageSize
        };
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
        body: data
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
      const payload: any = { ...data };
      if (data.pin || (data as any).ownerPin) {
        payload.currentSessionId = null;
      }
      return await withRetry(() => updateDoc(doc(db, 'garages', id), payload));
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
      return await withRetry(async () => {
        const q = query(
          collection(db, `garages/${garageId}/vehicles`),
          where('status', '==', 'inside')
        );
        const snapshot = await getDocs(q);
        const actualCount = snapshot.size;

        await updateDoc(doc(db, 'garages', garageId), {
          carsInside: actualCount
        });

        return actualCount;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}/recalculateCarsInside`);
      throw error;
    }
  },

  deleteGarage: async (
    id: string,
    onProgress?: (progress: GarageDeletionProgress) => void
  ) => {
    try {
      onProgress?.({ total: 100, processed: 10, percentage: 10, phase: 'preparing' });
      onProgress?.({ total: 100, processed: 50, percentage: 50, phase: 'deleting' });

      await apiFetch('/api/garages/delete', {
        method: 'POST',
        body: { garageId: id }
      });

      onProgress?.({ total: 100, processed: 100, percentage: 100, phase: 'complete' });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `garages/${id}`);
      throw error;
    }
  },

  adminTopupGarageBalance: async (garageId: string, amount: number) => {
    try {
      const data = await apiFetch('/api/transactions/admin-topup-balance', {
        method: 'POST',
        body: { garageId, amount }
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
        body: { garageId, packageId, packageData }
      });
      return data.data;
    } catch (error) {
      console.error('[GarageService] garageSelfSubscribe error:', error);
      throw error;
    }
  }
};
