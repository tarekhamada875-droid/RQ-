import { db, handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
} from 'firebase/firestore';
import type { Delegate, Garage, ActivityLog } from '../types';
import { safeDate } from '../utils/dates';

export interface DelegateDashboardData {
  delegate: Delegate;
  garages: Garage[];
  pagination: Record<DelegateDashboardSection, { hasMore: boolean; nextCursor: string | null }>;
}

export type DelegateDashboardSection = 'createdGarages' | 'referredGarages';

export interface DelegateCreditRequest {
  id: string;
  garageId: string;
  garageName: string;
  delegateId: string;
  delegateName: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reviewedAt: number | null;
}

export interface DelegateDashboardPage {
  items: Garage[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface DelegatePage {
  delegates: Delegate[];
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

  addDelegate: async (data: Omit<Delegate, 'id'>) => {
    try {
      const res = await apiFetch('/api/delegates/create', {
        method: 'POST',
        body: data
      });
      return { id: res.id };
    } catch (error: any) {
      if (error.message === 'PIN_ALREADY_TAKEN' || error.message === 'PIN_PREVIOUSLY_USED') {
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
      if (error.message === 'PIN_ALREADY_TAKEN' || error.message === 'PIN_PREVIOUSLY_USED') {
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
        orderBy('timestamp', 'desc'),
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

  // ── Credit requests (delegate → admin) ───────────────────────────────
  createCreditRequest: async (garageId: string, amount: number): Promise<{ id: string }> => {
    const res = await apiFetch<{ success: boolean; id: string }>('/api/delegates/credit-requests', {
      method: 'POST',
      body: { garageId, amount },
    });
    return { id: res.id };
  },

  listMyCreditRequests: async (): Promise<DelegateCreditRequest[]> => {
    const res = await apiFetch<{ success: boolean; requests: DelegateCreditRequest[] }>('/api/delegates/credit-requests');
    return res.requests || [];
  },

};

