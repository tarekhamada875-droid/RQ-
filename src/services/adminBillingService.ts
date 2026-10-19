import { handleFirestoreError, OperationType } from '../firebase';
import { apiFetch } from '../api/apiClient';
import type { FinancialReportData, FinancialReportFilters } from './adminServiceTypes';

export const adminBillingService = {
  adminGrantGarageCredits: async (garageId: string, command: { packageId?: string; amount?: number; paymentAmountEgp: number; paymentReference: string; reason: string; paymentConfirmed: boolean; idempotencyKey: string }): Promise<any> => {
    return apiFetch(`/api/garages/${encodeURIComponent(garageId)}/credit-grants`, {
      method: 'POST',
      body: command
    });
  },


  getGarageCreditLedger: async (garageId: string): Promise<any[]> => {
    const response = await apiFetch<{ data: any[] }>(`/api/garages/${encodeURIComponent(garageId)}/credit-ledger?limit=50`);
    return Array.isArray(response?.data) ? response.data : [];
  },

  getFinancialReport: async (filters: FinancialReportFilters): Promise<FinancialReportData> => {
    const params = new URLSearchParams({ start: filters.start, end: filters.end });
    const response = await apiFetch<{ data?: { report?: FinancialReportData } }>(`/api/reports/financial?${params.toString()}`);
    if (!response.data?.report) throw new Error('REPORT_DATA_UNAVAILABLE');
    return response.data.report;
  },


  updateTrialDecision: async (garageId: string, trialDecision: 'continued' | 'declined' | 'dismissed' | 'resolved' | null): Promise<void> => {
    try {
      await apiFetch('/api/garages/trial-decision', {
        method: 'POST',
        body: { garageId, trialDecision }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `garages/${garageId}`);
      throw error;
    }
  }
};
