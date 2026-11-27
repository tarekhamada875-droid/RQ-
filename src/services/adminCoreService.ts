import { db } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { StaffMember } from '../types';

export const adminCoreService = {
  // Reads the staff list for a garage. Used by the garage-side reports view
  // to break down per-staff performance. The admin-side staff management UI
  // (add/update/delete) was removed when the staff role was retired; the
  // collection itself is preserved until the role's full removal phase.
  getStaffByGarageOnce: async (garageId: string): Promise<StaffMember[]> => {
    try {
      const q = query(collection(db, 'staff'), where('garageId', '==', garageId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as StaffMember));
    } catch (e) {
      console.warn('Error in getStaffByGarageOnce:', e);
      return [];
    }
  },


  updateAdminPin: async (newPin: string, currentPin?: string): Promise<void> => {
    try {
      await apiFetch('/api/admin/update-pin', {
        method: 'POST',
        body: { newPin, currentPin }
      });
    } catch (error: any) {
      console.error('[AdminService] updateAdminPin error:', error);
      if (error.message === 'PIN_ALREADY_TAKEN' || error.message === 'PIN_PREVIOUSLY_USED') {
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
};
