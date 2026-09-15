import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDocs, 
  orderBy, 
  limit
} from 'firebase/firestore';
import type { Delegate, RechargeRequest, ActivityLog } from '../types';
import { safeDate } from '../utils';
import { validateRechargeRequest } from '../domain/garage/validation';
import { listenerTracker } from '../utils/listenerTracker';
import { generateIdempotencyKey } from '../types/apiContracts';

export const delegateService = {
  addDelegate: async (data: Omit<Delegate, 'id'>) => {
    try {
      const res = await apiFetch('/api/delegates/create', {
        method: 'POST',
        body: data
      });
      return { id: res.id };
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل');
      }
      throw error;
    }
  },

  removeDelegate: async (id: string) => {
    try {
      await apiFetch('/api/delegates/delete', {
        method: 'POST',
        body: { id }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `delegates/${id}`);
      throw error;
    }
  },

  subscribeToDelegates: (callback: (delegates: Delegate[]) => void) => {
    const trackerUnsub = listenerTracker.register('delegates');
    const q = query(collection(db, 'delegates'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const delegates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Delegate));
      callback(delegates);
    }, (err) => {
      console.warn('[delegateService] subscribeToDelegates listener error:', err);
      callback([]);
    });

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  subscribeToDelegate: (delegateId: string, callback: (delegate: Delegate) => void) => {
    const trackerUnsub = listenerTracker.register(`delegates/${delegateId}`);
    const unsub = onSnapshot(doc(db, 'delegates', delegateId), (snapshot) => {
      if (snapshot.exists()) {
        callback({ id: snapshot.id, ...snapshot.data() } as Delegate);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `delegates/${delegateId}`));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  getDelegateByPhone: async (phone: string) => {
    try {
      const q = query(collection(db, 'delegates'), where('phone', '==', phone), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Delegate;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'delegates');
      throw error;
    }
  },

  updateDelegate: async (id: string, data: Partial<Delegate>) => {
    try {
      if (data.pin) {
        await apiFetch('/api/people/update-pin', {
          method: 'POST',
          body: { entityType: 'delegates', entityId: id, newPin: data.pin }
        });
      }
      const { pin, ...otherFields } = data;
      if (Object.keys(otherFields).length > 0) {
        await apiFetch('/api/delegates/update', {
          method: 'POST',
          body: { id, ...otherFields }
        });
      }
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل');
      }
      handleFirestoreError(error, OperationType.UPDATE, `delegates/${id}`);
      throw error;
    }
  },

  settleDelegateAccount: async (id: string) => {
    try {
      return await apiFetch('/api/delegates/settle-account', {
        method: 'POST',
        body: { id }
      });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `delegates/${id}`);
      throw error;
    }
  },

  getDelegateRecharges: async (delegateId: string) => {
    try {
      const q = query(
        collection(db, 'activity_logs'),
        where('staffId', '==', delegateId),
        where('actionType', '==', 'recharge'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      logs.sort((a, b) => safeDate(b.timestamp).getTime() - safeDate(a.timestamp).getTime());
      return logs;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'activity_logs');
      throw error;
    }
  },

  getDelegateRechargeRequests: async (delegateId: string): Promise<RechargeRequest[]> => {
    try {
      const q = query(
        collection(db, 'recharge_requests'),
        where('delegateId', '==', delegateId),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RechargeRequest));
      requests.sort((a, b) => safeDate(b.createdAt).getTime() - safeDate(a.createdAt).getTime());
      return requests;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'recharge_requests');
      throw error;
    }
  },

  createRechargeRequest: async (data: Omit<RechargeRequest, 'id' | 'status' | 'createdAt'>) => {
    try {
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, v]) => v !== undefined)
      );
      const res = await apiFetch('/api/recharge-requests/create', {
        method: 'POST',
        body: { ...cleanData, idempotencyKey: generateIdempotencyKey('recharge_request') }
      });
      return { id: res.id };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'recharge_requests');
      throw error;
    }
  },

  getPendingRechargeRequestsForGarage: async (garageId: string, delegateId?: string) => {
    try {
      if (delegateId) {
        const q = query(
          collection(db, 'recharge_requests'),
          where('delegateId', '==', delegateId),
          limit(20)
        );
        const snapshot = await getDocs(q);
        const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RechargeRequest));
        return requests.filter(r => r.status === 'pending' && r.garageId === garageId);
      }
      const q = query(
        collection(db, 'recharge_requests'),
        where('garageId', '==', garageId),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RechargeRequest));
      return requests.filter(r => r.status === 'pending');
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'recharge_requests');
      throw error;
    }
  },

  subscribeToPendingRechargeRequests: (callback: (requests: RechargeRequest[]) => void) => {
    const trackerUnsub = listenerTracker.register('pending_recharge_requests');
    const q = query(
      collection(db, 'recharge_requests'),
      where('status', '==', 'pending'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RechargeRequest));
      requests.sort((a, b) => safeDate(b.createdAt).getTime() - safeDate(a.createdAt).getTime());
      callback(requests);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'recharge_requests'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  subscribeToDelegateRechargeRequests: (delegateId: string, callback: (requests: RechargeRequest[]) => void) => {
    const trackerUnsub = listenerTracker.register(`delegates/${delegateId}/recharge_requests`);
    const q = query(
      collection(db, 'recharge_requests'),
      where('delegateId', '==', delegateId),
      limit(20)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RechargeRequest));
      callback(requests);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'recharge_requests'));

    return () => {
      unsub();
      trackerUnsub();
    };
  },

  approveRechargeRequest: async (request: any): Promise<{ success: boolean; error?: string }> => {
    const validation = validateRechargeRequest(request);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(' — ') };
    }

    try {
      await apiFetch('/api/transactions/approve-recharge-request', {
        method: 'POST',
        body: {
          requestId: request.id,
          request
        }
      });

      return { success: true };
    } catch (err: any) {
      if (err.message === 'REQUEST_ALREADY_PROCESSED') {
        return { success: false, error: 'الطلب تم معالجته مسبقاً' };
      } else if (err.message === 'REQUEST_NOT_FOUND') {
        return { success: false, error: 'الطلب غير موجود' };
      }
      return { success: false, error: err.message || 'حدث خطأ أثناء اعتماد الطلب' };
    }
  },

  rejectRechargeRequest: async (requestId: string) => {
    try {
      await apiFetch('/api/transactions/reject-recharge-request', {
        method: 'POST',
        body: {
          requestId
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recharge_requests/${requestId}/reject`);
      throw error;
    }
  }
};
