import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  documentId,
  getDocs, 
  orderBy, 
  limit,
} from 'firebase/firestore';
import type { Delegate, Garage, RechargeRequest, ActivityLog } from '../types';
import { safeDate } from '../utils';
import { validateRechargeRequest } from '../domain/garage/validation';
import { listenerTracker } from '../utils/listenerTracker';
import { generateIdempotencyKey } from '../types/apiContracts';

export interface DelegateDashboardData {
  delegate: Delegate;
  garages: Garage[];
  requests: RechargeRequest[];
  pagination: Record<DelegateDashboardSection, { hasMore: boolean; nextCursor: string | null }>;
}

export type DelegateDashboardSection = 'createdGarages' | 'referredGarages' | 'requests';
export interface DelegateDashboardPage {
  items: Array<Garage | RechargeRequest>;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface DelegatePage {
  delegates: Delegate[];
  lastDoc: string | null;
  hasMore: boolean;
}

export interface AdminRechargeRequestPage {
  requests: RechargeRequest[];
  lastDoc: string | null;
  hasMore: boolean;
}

async function createSettlementIdempotencyKey(delegateId: string, totalRechargedAmount: number, lastSettledAt?: unknown): Promise<string> {
  let settlementMarker = 'initial';
  if (lastSettledAt instanceof Date && !Number.isNaN(lastSettledAt.getTime())) {
    settlementMarker = lastSettledAt.toISOString();
  } else if (lastSettledAt && typeof lastSettledAt === 'object' && 'toDate' in lastSettledAt && typeof lastSettledAt.toDate === 'function') {
    const date = lastSettledAt.toDate();
    if (date instanceof Date && !Number.isNaN(date.getTime())) settlementMarker = date.toISOString();
  } else if (typeof lastSettledAt === 'string' && lastSettledAt.trim()) {
    settlementMarker = lastSettledAt.trim();
  }
  const signature = `${delegateId}|${Number(totalRechargedAmount)}|${settlementMarker}`;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `delegate_settle_${hex}`;
}

export const delegateService = {
  getDashboardData: async (delegateId: string): Promise<DelegateDashboardData> => {
    const response = await apiFetch<DelegateDashboardData & { success: boolean }>('/api/delegates/dashboard');
    if (response.delegate.id !== delegateId) throw new Error('DELEGATE_SCOPE_MISMATCH');
    return response;
  },

  getDashboardDataPage: async (delegateId: string, section: DelegateDashboardSection, cursor: string): Promise<DelegateDashboardPage> => {
    const params = new URLSearchParams({ section, limit: '50', cursor });
    const response = await apiFetch<DelegateDashboardPage & { delegate: Delegate }>(`/api/delegates/dashboard?${params.toString()}`);
    if (response.delegate.id !== delegateId) throw new Error('DELEGATE_SCOPE_MISMATCH');
    return response;
  },

  getAdminRechargeRequestsPage: async (pageSize = 20, cursor: string | null = null): Promise<AdminRechargeRequestPage> => {
    const params = new URLSearchParams({ limit: String(pageSize), status: 'pending' });
    if (cursor) params.set('cursor', cursor);
    const page = await apiFetch<{ requests: RechargeRequest[]; hasMore: boolean; nextCursor: string | null }>(`/api/recharge-requests?${params.toString()}`);
    return { requests: page.requests, lastDoc: page.nextCursor, hasMore: page.hasMore };
  },

  addDelegate: async (data: Omit<Delegate, 'id'>) => {
    try {
      const res = await apiFetch('/api/delegates/create', {
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

  getAdminDelegatesPage: async (pageSize = 50, lastDocRef: string | null = null): Promise<DelegatePage> => {
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (lastDocRef) params.set('cursor', lastDocRef);
      const page = await apiFetch<{ delegates: Delegate[]; hasMore: boolean; nextCursor: string | null }>(`/api/admin/delegates?${params.toString()}`);
      return { delegates: page.delegates, lastDoc: page.nextCursor, hasMore: page.hasMore };
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'delegates/admin-page');
      throw error;
    }
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
      const { pin: _pin, ...otherFields } = data;
      if (Object.keys(otherFields).length > 0 || data.pin) {
        await apiFetch('/api/delegates/update', {
          method: 'POST',
          body: { id, ...otherFields, ...(data.pin ? { pin: data.pin } : {}) }
        });
      }
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN') {
        throw new Error('الرمز مستخدم بالفعل', { cause: error });
      }
      handleFirestoreError(error, OperationType.UPDATE, `delegates/${id}`);
      throw error;
    }
  },

  settleDelegateAccount: async (id: string, totalRechargedAmount: number, lastSettledAt?: unknown) => {
    try {
      const idempotencyKey = await createSettlementIdempotencyKey(id, totalRechargedAmount, lastSettledAt);
      return await apiFetch('/api/delegates/settle-account', {
        method: 'POST',
        body: { id, idempotencyKey }
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

  subscribeToPendingRechargeRequests: (callback: (requests: RechargeRequest[]) => void) => {
    const trackerUnsub = listenerTracker.register('pending_recharge_requests');
    const q = query(
      collection(db, 'recharge_requests'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
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
          request,
          idempotencyKey: generateIdempotencyKey('manual_recharge_approve')
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
          requestId,
          idempotencyKey: generateIdempotencyKey('manual_recharge_reject')
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recharge_requests/${requestId}/reject`);
      throw error;
    }
  }
};
