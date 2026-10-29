import { apiFetch } from '../api/apiClient';

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

  // getFinancialReport: removed. Dead code — no admin UI calls this.
};
