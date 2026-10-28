import { describe, expect, it } from 'vitest';
import {
  calculateApprovedCommission,
  calculateApprovedRechargeTotal,
  filterRequestsByMonth,
  getAvailableRequestMonths
} from './delegateCommissionCalculations';

describe('canonical delegate financial aggregation', () => {
  const records = [
    { id: 'sale', actionType: 'recharge', amount: 500, timestamp: '2026-08-10T10:00:00Z' },
    { id: 'commission', actionType: 'commission_earned', commission: 100, timestamp: '2026-08-10T10:01:00Z' },
    { id: 'legacy', status: 'approved', amount: 1000, commission: 30, timestamp: '2026-08-10T10:02:00Z' },
    { id: 'other-month', actionType: 'recharge', amount: 200, timestamp: '2026-07-10T10:00:00Z' }
  ];

  it('keeps gross recharge sales separate from Worker commission events', () => {
    expect(calculateApprovedRechargeTotal(records, '2026-08')).toBe(500);
    expect(calculateApprovedCommission(records, '2026-08')).toBe(100);
  });

  it('does not treat legacy approved request values as canonical financial events', () => {
    expect(calculateApprovedRechargeTotal([{ status: 'approved', amount: 900, commission: 30 }])).toBe(0);
    expect(calculateApprovedCommission([{ status: 'approved', amount: 900, commission: 30 }])).toBe(0);
  });

  it('filters records by month and includes months represented by events', () => {
    expect(filterRequestsByMonth(records, '2026-08')).toHaveLength(3);
    expect(getAvailableRequestMonths(records, '2026-09')).toEqual(['2026-09', '2026-08', '2026-07']);
  });
});
