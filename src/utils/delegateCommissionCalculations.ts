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
 * Calculates total fixed commission from approved requests (or logs) for a given month/all time.
 * Ignores pending/rejected requests and uses the explicit recorded commission value.
 */
export const calculateApprovedCommission = (
  requests: CommissionRequestLike[], 
  monthKey: string = 'all'
): number => {
  const approved = filterApprovedRequests(requests);
  const filtered = filterRequestsByMonth(approved, monthKey);
  return filtered.reduce((sum, request) => {
    let comm = 0;
    if (request.commission !== undefined && request.commission !== null) {
      comm = Number(request.commission);
    } else if (request.details?.commission !== undefined && request.details?.commission !== null) {
      comm = Number(request.details.commission);
    }
    return sum + (isNaN(comm) ? 0 : comm);
  }, 0);
};

/**
 * Calculates total recharged/revenue amount from approved requests for a given month/all time
 */
export const calculateApprovedRechargeTotal = (
  requests: CommissionRequestLike[], 
  monthKey: string = 'all'
): number => {
  const approved = filterApprovedRequests(requests);
  const filtered = filterRequestsByMonth(approved, monthKey);
  return filtered.reduce((sum, request) => {
    let amt = 0;
    if (request.revenueAmount !== undefined && request.revenueAmount !== null) {
      amt = Number(request.revenueAmount);
    } else if (request.amount !== undefined && request.amount !== null) {
      amt = Number(request.amount);
    } else if (request.details?.revenueAmount !== undefined && request.details?.revenueAmount !== null) {
      amt = Number(request.details.revenueAmount);
    } else if (request.details?.amount !== undefined && request.details?.amount !== null) {
      amt = Number(request.details.amount);
    }
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);
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
