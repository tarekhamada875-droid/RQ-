/**
 * adminIncomeService — client calls for the admin Income page (الدخل),
 * owner feature 2026-11-23. On-demand only: both GETs fire when the screen
 * opens (no listener, no polling — read-economy rule, docs/PROJECT.md).
 *
 * Costs (Worker-side reads):
 *  - summary: 1 read warm; the first-ever call performs the one-time income
 *    alignment (pages all garage docs once) and stamps incomeRecountAt.
 *  - history: one read per returned row (+ ≤pageSize name lookups for legacy
 *    rows written before garageName stamping existed).
 */
import { apiCall } from '../api/apiCall';

export interface AdminIncomeSummary {
  totalIncomeEgp: number;
  recounted?: boolean;
}

export interface AdminIncomeRow {
  id: string;
  garageId?: string;
  garageName?: string;
  amount?: number;
  paymentAmountEgp?: number;
  balanceAfter?: number;
  occurredAt?: string;
  reason?: string;
  source?: string;
}

export interface AdminIncomeHistoryPage {
  rows: AdminIncomeRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const adminIncomeService = {
  getIncomeSummary: (): Promise<AdminIncomeSummary> =>
    apiCall<AdminIncomeSummary>('/api/admin/income/summary'),

  getIncomeHistoryPage: async (cursor?: string | null, limit = 50): Promise<AdminIncomeHistoryPage> => {
    const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    // The endpoint nests { rows, hasMore, nextCursor } inside data so the
    // single envelope unwrap in apiCall keeps the paging fields together.
    // Screens use the default 50-row wallet; the export walk passes 100
    // (server max) purely to halve round trips — per-row cost is unchanged.
    const page = await apiCall<AdminIncomeHistoryPage>(`/api/admin/income/history?limit=${limit}${cursorQuery}`);
    return {
      rows: page?.rows || [],
      hasMore: !!page?.hasMore,
      nextCursor: page?.nextCursor ?? null
    };
  }
};
