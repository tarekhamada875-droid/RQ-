import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { collection, query, where, onSnapshot, doc, getDocs, orderBy } from 'firebase/firestore';
import { listenerTracker } from '../utils/listenerTracker';
import type { Staff } from '../types';
import type { AdminSummary } from './adminServiceTypes';

export const adminCoreService = {
  getAdminSummary: async (): Promise<AdminSummary> => {
    const response = await apiFetch<{ summary: AdminSummary }>('/api/admin/summary');
    return response.summary;
  },

  // Staff

  addStaff: async (data: Omit<Staff, 'id'>) => {
    try {
      const res = await apiFetch('/api/staff/create', {
        method: 'POST',
        body: data
      });
      return { id: res.id };
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل', { cause: error });
      }
      throw error;
    }
  },


  updateStaff: async (id: string, data: Partial<Staff>) => {
    try {
      const { pin: _pin, ...otherFields } = data;
      await apiFetch('/api/staff/update', {
        method: 'POST',
        body: { id, ...otherFields, ...(data.pin ? { pin: data.pin } : {}) }
      });
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل', { cause: error });
      }
      handleFirestoreError(error, OperationType.UPDATE, `staff/${id}`);
      throw error;
    }
  },


  removeStaff: async (id: string) => {
    try {
      await apiFetch('/api/staff/delete', {
        method: 'POST',
        body: { id }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `staff/${id}`);
      throw error;
    }
  },


  getStaffByGarageOnce: async (garageId: string): Promise<Staff[]> => {
    try {
      const q = query(collection(db, 'staff'), where('garageId', '==', garageId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Staff));
    } catch (e) {
      console.warn('Error in getStaffByGarageOnce:', e);
      return [];
    }
  },


  subscribeToGarageStaff: (garageId: string, callback: (staff: Staff[]) => void) => {
    const trackerUnsub = listenerTracker.register(`garages/${garageId}/staff`);
    const q = query(
      collection(db, 'staff'),
      where('garageId', '==', garageId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff));
      callback(list);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'staff'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },


  subscribeToAdminPin: (callback: (pin: string) => void) => {
    return onSnapshot(doc(db, 'admin_settings', 'auth_pin'), (snapshot) => {
      callback(snapshot.data()?.pin || '');
    }, (err) => {
      console.warn('Admin pin subscription notice:', err);
      callback('');
    });
  },


  updateAdminPin: async (newPin: string, currentPin?: string): Promise<void> => {
    try {
      await apiFetch('/api/admin/update-pin', {
        method: 'POST',
        body: { newPin, currentPin }
      });
    } catch (error: any) {
      console.error('[AdminService] updateAdminPin error:', error);
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل', { cause: error });
      }
      if (error.message === 'CURRENT_PIN_REQUIRED') {
        throw new Error('رمز الدخول الحالي مطلوب', { cause: error });
      }
      if (error.message === 'CURRENT_PIN_INCORRECT') {
        throw new Error('رمز الدخول الحالي غير صحيح', { cause: error });
      }
      throw error;
    }
  },


  updateWalletNumber: async (walletNumber: string): Promise<void> => {
    try {
      await apiFetch('/api/admin/update-system-config', {
        method: 'POST',
        body: { walletNumber }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'system_config/global');
      throw error;
    }
  },

  // Packages Management
};
