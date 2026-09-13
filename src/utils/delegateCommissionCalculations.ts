import { safeDate } from './index';

export interface CommissionRequestLike {
  id?: string;
  status?: string;
  actionType?: string;
  commission?: number;
  amount?: number;
  revenueAmount?: number;
  createdAt?: any;
  resolvedAt?: any;
  timestamp?: any;
  details?: {
    commission?: number;
    revenueAmount?: number;
    amount?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Extracts a normalized month key 'YYYY-MM' from a request or activity log
 */
export const getRequestMonthKey = (request: CommissionRequestLike): string | null => {
  if (!request) return null;
  const rawDate = request.resolvedAt || request.createdAt || request.timestamp;
  if (!rawDate) return null;
  const d = safeDate(rawDate);
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

/**
 * Filters requests that are approved (status === 'approved' or actionType === 'recharge')
 */
export const filterApprovedRequests = <T extends CommissionRequestLike>(requests: T[]): T[] => {
  if (!Array.isArray(requests)) return [];
  return requests.filter(r => {
    if (!r) return false;
    if (r.status) {
      return r.status === 'approved';
    }
    if (r.actionType) {
      return r.actionType === 'recharge';
    }
    return false;
  });
};

/**
 * Filters requests by target monthKey ('YYYY-MM' or 'all')
 */
export const filterRequestsByMonth = <T extends CommissionRequestLike>(
  requests: T[], 
  monthKey: string = 'all'
): T[] => {
  if (!Array.isArray(requests)) return [];
  if (!monthKey || monthKey === 'all') return requests;
  return requests.filter(r => getRequestMonthKey(r) === monthKey);
};

/**
 * Single-pass comprehensive financial summary calculation for delegate transactions & commissions.
 * Aggregates commissions, recharge revenues, and counts in O(N) with zero allocation overhead.
 */
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
  let totalCommission = 0;
  let totalRechargeAmount = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let rejectedCount = 0;

  if (!Array.isArray(requests)) {
    return { totalCommission, totalRechargeAmount, approvedCount, pendingCount, rejectedCount };
  }

  const isAllMonths = !monthKey || monthKey === 'all';

  for (let i = 0; i < requests.length; i++) {
    const r = requests[i];
    if (!r) continue;

    const status = r.status || (r.actionType === 'recharge' ? 'approved' : '');
    if (status === 'pending') {
      pendingCount++;
      continue;
    }
    if (status === 'rejected') {
      rejectedCount++;
      continue;
    }

    if (status === 'approved') {
      if (!isAllMonths && getRequestMonthKey(r) !== monthKey) continue;
      approvedCount++;

      const comm = r.commission ?? r.details?.commission;
      if (comm !== undefined && comm !== null) {
        const val = Number(comm);
        if (!isNaN(val)) totalCommission += val;
      }

      const amt = r.revenueAmount ?? r.amount ?? r.details?.revenueAmount ?? r.details?.amount;
      if (amt !== undefined && amt !== null) {
        const val = Number(amt);
        if (!isNaN(val)) totalRechargeAmount += val;
      }
    }
  }

  return {
    totalCommission,
    totalRechargeAmount,
    approvedCount,
    pendingCount,
    rejectedCount
  };
};

/**
 * Calculates total fixed commission from approved requests (or logs) for a given month/all time.
 * Ignores pending/rejected requests and uses the explicit recorded commission value.
 */
export const calculateApprovedCommission = (
  requests: CommissionRequestLike[], 
  monthKey: string = 'all'
): number => {
  return calculateCommissionFinancialSummary(requests, monthKey).totalCommission;
};

/**
 * Calculates total recharged/revenue amount from approved requests for a given month/all time
 */
export const calculateApprovedRechargeTotal = (
  requests: CommissionRequestLike[], 
  monthKey: string = 'all'
): number => {
  return calculateCommissionFinancialSummary(requests, monthKey).totalRechargeAmount;
};

/**
 * Returns sorted unique list of months available from requests
 */
export const getAvailableRequestMonths = (
  requests: CommissionRequestLike[], 
  currentMonthKey?: string
): string[] => {
  const monthsSet = new Set<string>();
  if (currentMonthKey) monthsSet.add(currentMonthKey);
  (requests || []).forEach(r => {
    const key = getRequestMonthKey(r);
    if (key) monthsSet.add(key);
  });
  return Array.from(monthsSet).sort().reverse();
};
