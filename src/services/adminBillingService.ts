import { apiFetch } from '../api/apiClient';
import type { DelegateCreditRequest } from './delegateService';

export const adminBillingService = {
  adminGrantGarageCredits: async (garageId: string, command: { amount?: number; paymentAmountEgp: number; reason: string; paymentConfirmed: boolean; idempotencyKey: string }): Promise<any> => {
    return apiFetch(`/api/garages/${encodeURIComponent(garageId)}/credit-grants`, {
      method: 'POST',
      body: command
    });
  },

  adminCorrectGarageCredits: async (garageId: string, command: { amount: number; reason: string; idempotencyKey: string }): Promise<any> => {
    return apiFetch(`/api/garages/${encodeURIComponent(garageId)}/credit-corrections`, {
      method: 'POST',
      body: command
    });
  },

  getGarageCreditLedger: async (garageId: string): Promise<any[]> => {
    const response = await apiFetch<{ data: any[] }>(`/api/garages/${encodeURIComponent(garageId)}/credit-ledger?limit=50`);
    return Array.isArray(response?.data) ? response.data : [];
  },

  // ── Credit requests (delegate → admin) ───────────────────────────────
  listPendingCreditRequests: async (): Promise<DelegateCreditRequest[]> => {
    const res = await apiFetch<{ success: boolean; requests: DelegateCreditRequest[] }>('/api/admin/credit-requests?status=pending');
    return res.requests || [];
  },

  approveCreditRequest: async (requestId: string): Promise<{ credits: number; commissionGranted: boolean; commissionAmount: number }> => {
    return apiFetch(`/api/admin/credit-requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
    });
  },

  rejectCreditRequest: async (requestId: string): Promise<void> => {
    await apiFetch(`/api/admin/credit-requests/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
    });
  },

  // getFinancialReport: removed. Dead code — no admin UI calls this.
};
