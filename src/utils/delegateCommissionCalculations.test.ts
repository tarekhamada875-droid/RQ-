import { describe, it, expect } from 'vitest';
import {
  calculateApprovedCommission,
  calculateApprovedRechargeTotal,
  filterApprovedRequests,
  getAvailableRequestMonths,
  CommissionRequestLike
} from './delegateCommissionCalculations';

describe('Delegate Fixed Commission Calculations', () => {
  it('calculates fixed commission of 30 EGP for a 330 EGP request (not 33 EGP percentage)', () => {
    const requests: CommissionRequestLike[] = [
      {
        id: 'req-1',
        status: 'approved',
        amount: 330,
        revenueAmount: 330,
        commission: 30,
        createdAt: '2026-08-10T12:00:00Z',
      }
    ];

    const commission = calculateApprovedCommission(requests, '2026-08');
    const rechargeTotal = calculateApprovedRechargeTotal(requests, '2026-08');

    // Crucial check: commission must be exactly 30, not 33 (which would happen with a 10% rate)
    expect(commission).toBe(30);
    expect(rechargeTotal).toBe(330);
  });

  it('calculates 90 EGP for three approved requests with commission 30 each', () => {
    const requests: CommissionRequestLike[] = [
      { id: '1', status: 'approved', amount: 330, commission: 30, createdAt: '2026-08-01T10:00:00Z' },
      { id: '2', status: 'approved', amount: 450, commission: 30, createdAt: '2026-08-05T11:00:00Z' },
      { id: '3', status: 'approved', amount: 200, commission: 30, createdAt: '2026-08-12T15:00:00Z' },
    ];

    expect(calculateApprovedCommission(requests, '2026-08')).toBe(90);
    expect(calculateApprovedCommission(requests, 'all')).toBe(90);
    expect(calculateApprovedRechargeTotal(requests, 'all')).toBe(980);
  });

  it('ignores pending and rejected requests in commission total', () => {
    const requests: CommissionRequestLike[] = [
      { id: '1', status: 'approved', amount: 330, commission: 30, createdAt: '2026-08-01T10:00:00Z' },
      { id: '2', status: 'pending', amount: 330, commission: 30, createdAt: '2026-08-02T10:00:00Z' },
      { id: '3', status: 'rejected', amount: 330, commission: 30, createdAt: '2026-08-03T10:00:00Z' },
    ];

    const approvedOnly = filterApprovedRequests(requests);
    expect(approvedOnly).toHaveLength(1);
    expect(approvedOnly[0].id).toBe('1');

    expect(calculateApprovedCommission(requests, '2026-08')).toBe(30);
    expect(calculateApprovedRechargeTotal(requests, '2026-08')).toBe(330);
  });

  it('maintains historical commission amounts even if system configuration changes later', () => {
    // Existing requests recorded with their snapshot commission
    const requests: CommissionRequestLike[] = [
      { id: '1', status: 'approved', amount: 330, commission: 30, createdAt: '2026-07-01T10:00:00Z' },
      { id: '2', status: 'approved', amount: 350, commission: 50, createdAt: '2026-08-01T10:00:00Z' },
    ];

    // Simulating future configuration change where referralFeePerRenewal would be 100
    // The calculation on existing requests strictly uses request.commission without recomputing
    expect(calculateApprovedCommission(requests, '2026-07')).toBe(30);
    expect(calculateApprovedCommission(requests, '2026-08')).toBe(50);
    expect(calculateApprovedCommission(requests, 'all')).toBe(80);
  });

  it('filters requests and commissions accurately across different months', () => {
    const requests: CommissionRequestLike[] = [
      { id: '1', status: 'approved', amount: 300, commission: 30, createdAt: '2026-08-01T10:00:00Z' },
      { id: '2', status: 'approved', amount: 600, commission: 60, createdAt: '2026-08-15T10:00:00Z' },
      { id: '3', status: 'approved', amount: 500, commission: 40, createdAt: '2026-07-20T10:00:00Z' },
      { id: '4', status: 'approved', amount: 400, commission: 35, createdAt: '2026-06-10T10:00:00Z' },
    ];

    expect(getAvailableRequestMonths(requests, '2026-08')).toEqual(['2026-08', '2026-07', '2026-06']);
    expect(calculateApprovedCommission(requests, '2026-08')).toBe(90);
    expect(calculateApprovedCommission(requests, '2026-07')).toBe(40);
    expect(calculateApprovedCommission(requests, '2026-06')).toBe(35);
    expect(calculateApprovedCommission(requests, 'all')).toBe(165);
  });

  it('handles activity logs with details.commission fallback gracefully', () => {
    const logs: CommissionRequestLike[] = [
      {
        id: 'log-1',
        actionType: 'recharge',
        amount: 330,
        timestamp: '2026-08-01T10:00:00Z',
        details: { commission: 30, revenueAmount: 330 }
      },
      {
        id: 'log-2',
        actionType: 'recharge',
        amount: 500,
        timestamp: '2026-08-05T10:00:00Z',
        details: { commission: 30, revenueAmount: 500 }
      }
    ];

    expect(calculateApprovedCommission(logs, '2026-08')).toBe(60);
    expect(calculateApprovedRechargeTotal(logs, '2026-08')).toBe(830);
  });
});
