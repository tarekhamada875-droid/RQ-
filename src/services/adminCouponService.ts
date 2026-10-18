import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { listenerTracker } from '../utils/listenerTracker';
import type { Coupon } from '../types';

export const adminCouponService = {
  addCoupon: async (coupon: Omit<Coupon, 'id' | 'createdAt' | 'usedCount'>) => {
    try {
      const res = await apiFetch('/api/admin/coupons/create', {
        method: 'POST',
        body: coupon
      });
      return res.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'coupons');
      throw error;
    }
  },


  updateCoupon: async (id: string, data: Partial<Coupon>) => {
    try {
      await apiFetch('/api/admin/coupons/update', {
        method: 'POST',
        body: { id, ...data }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coupons/${id}`);
      throw error;
    }
  },


  deleteCoupon: async (id: string) => {
    try {
      await apiFetch('/api/admin/coupons/delete', {
        method: 'POST',
        body: { id }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `coupons/${id}`);
      throw error;
    }
  },


  subscribeToCoupons: (callback: (coupons: Coupon[]) => void) => {
    const trackerUnsub = listenerTracker.register('coupons');
    const q = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon));
      callback(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'coupons'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  // Activity Logs
};
