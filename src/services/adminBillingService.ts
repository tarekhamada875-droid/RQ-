import { apiCall } from '../api/apiCall';
import type { DelegateCreditRequest } from './delegateService';

export const adminBillingService = {
  adminGrantGarageCredits: async (garageId: string, command: { amount?: number; paymentAmountEgp: number; reason: string; paymentConfirmed: boolean; idempotencyKey: string }): Promise<any> => {
    return apiCall(`/api/garages/${encodeURIComponent(garageId)}/credit-grants`, {
      method: 'POST',
      body: command
    });
  },

  adminCorrectGarageCredits: async (garageId: string, command: { amount: number; reason: string; idempotencyKey: string }): Promise<any> => {
    return apiCall(`/api/garages/${encodeURIComponent(garageId)}/credit-corrections`, {
      method: 'POST',
      body: command
    });
  },

  getGarageCreditLedger: async (garageId: string): Promise<any[]> => {
    return apiCall<any[]>(`/api/garages/${encodeURIComponent(garageId)}/credit-ledger?limit=50`);
  },

  // ── Credit requests (delegate → admin) ───────────────────────────────
  listPendingCreditRequests: async (): Promise<DelegateCreditRequest[]> => {
    const res = await apiCall<{ requests: DelegateCreditRequest[] }>('/api/admin/credit-requests?status=pending');
    return res.requests || [];
  },

  approveCreditRequest: async (requestId: string): Promise<{ credits: number; commissionGranted: boolean; commissionAmount: number }> => {
    return apiCall(`/api/admin/credit-requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
    });
  },

  rejectCreditRequest: async (requestId: string): Promise<void> => {
    await apiCall(`/api/admin/credit-requests/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
    });
  },
};
