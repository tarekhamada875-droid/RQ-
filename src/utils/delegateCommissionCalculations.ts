import { safeDate } from './index';

export interface CommissionRequestLike {
  id?: string;
  status?: string;
  actionType?: string;
  commission?: number;
  amount?: number;
  revenueAmount?: number;
  createdAt?: unknown;
  resolvedAt?: unknown;
  timestamp?: unknown;
  details?: {
    commission?: number;
    revenueAmount?: number;
    amount?: number;
  };
}

export const getRequestMonthKey = (request: CommissionRequestLike): string | null => {
  const rawDate = request.resolvedAt || request.createdAt || request.timestamp;
  if (!rawDate) return null;
  const date = safeDate(rawDate);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const filterApprovedRequests = <T extends CommissionRequestLike>(requests: T[]): T[] =>
  Array.isArray(requests) ? requests.filter((request) =>
    request?.actionType === 'recharge' || request?.actionType === 'commission_earned'
  ) : [];

export const filterRequestsByMonth = <T extends CommissionRequestLike>(
  requests: T[],
  monthKey: string = 'all'
): T[] => {
  if (!Array.isArray(requests)) return [];
  if (!monthKey || monthKey === 'all') return requests;
  return requests.filter((request) => getRequestMonthKey(request) === monthKey);
};

export interface CommissionFinancialSummary {
  totalCommission: number;
  totalRechargeAmount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
}

export const calculateCommissionFinancialSummary = (
  requests: CommissionRequestLike[],
  monthKey: string = 'all'
): CommissionFinancialSummary => {
  const summary: CommissionFinancialSummary = {
    totalCommission: 0,
    totalRechargeAmount: 0,
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0
  };
  if (!Array.isArray(requests)) return summary;

  for (const request of requests) {
    if (!request) continue;
    if (request.status === 'pending') summary.pendingCount++;
    if (request.status === 'rejected') summary.rejectedCount++;
    if (monthKey && monthKey !== 'all' && getRequestMonthKey(request) !== monthKey) continue;

    if (request.actionType === 'recharge') {
      summary.approvedCount++;
      const amount = Number(request.amount ?? request.revenueAmount ?? request.details?.amount ?? request.details?.revenueAmount ?? 0);
      if (Number.isFinite(amount)) summary.totalRechargeAmount += amount;
    } else if (request.actionType === 'commission_earned') {
      summary.approvedCount++;
      const commission = Number(request.commission ?? request.details?.commission ?? 0);
      if (Number.isFinite(commission)) summary.totalCommission += commission;
    }
  }
  return summary;
};

export const calculateApprovedCommission = (
  requests: CommissionRequestLike[],
  monthKey: string = 'all'
): number => calculateCommissionFinancialSummary(requests, monthKey).totalCommission;

export const calculateApprovedRechargeTotal = (
  requests: CommissionRequestLike[],
  monthKey: string = 'all'
): number => calculateCommissionFinancialSummary(requests, monthKey).totalRechargeAmount;

export const getAvailableRequestMonths = (
  requests: CommissionRequestLike[],
  currentMonthKey?: string
): string[] => {
  const months = new Set<string>();
  if (currentMonthKey) months.add(currentMonthKey);
  (requests || []).forEach((request) => {
    const key = getRequestMonthKey(request);
    if (key) months.add(key);
  });
  return Array.from(months).sort().reverse();
};
