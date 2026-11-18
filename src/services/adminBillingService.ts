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

  // Per-garage credit price (owner decision 2026-11-18): admin-only, preset-only.
  // `egpPerCredit` is the DISPLAY unit (e.g. 0.75); the Worker stores its inverse
  // as garages/{id}.creditRateOverride. `clear: true` removes the override so the
  // garage follows the global rate again. Garages never see this value.
  setGarageCreditRate: async (garageId: string, command: { egpPerCredit?: number; clear?: boolean }): Promise<any> => {
    return apiCall(`/api/garages/${encodeURIComponent(garageId)}/credit-rate`, {
      method: 'POST',
      body: command
    });
  },

  getGarageCreditLedger: async (garageId: string): Promise<any[]> => {
    // PERF (owner debug audit 2026-11-17, finding F5): the recharge-history
    // screen only renders paid_grant rows — ask the server to filter so the
    // other ledger kinds never cross the wire (measured 24KB → mostly waste).
    return apiCall<any[]>(`/api/garages/${encodeURIComponent(garageId)}/credit-ledger?limit=50&kind=paid_grant`);
  },

  // ── Credit requests (delegate → admin) ───────────────────────────────
  listPendingCreditRequests: async (): Promise<DelegateCreditRequest[]> => {
    const res = await apiCall<{ requests: DelegateCreditRequest[] }>('/api/admin/credit-requests?status=pending');
    return res.requests || [];
  },

  // Per-garage pricing: the response carries the real conversion —
  // `creditsGranted` = round(paymentAmountEgp × this garage's rate), plus the
  // resulting balance, so the UI never has to guess the 1:1 assumption.
  approveCreditRequest: async (requestId: string): Promise<{ credits: number; creditsGranted?: number; paymentAmountEgp?: number; commissionGranted: boolean; commissionAmount: number }> => {
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
