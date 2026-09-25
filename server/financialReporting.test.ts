import { describe, expect, it } from 'vitest';
import { calculateFinancialReport } from './financialReporting';

describe('financial reporting projections', () => {
  const events = [
    { eventType: 'recharge_approved', aggregateId: 'req-1', occurredAt: '2026-09-18T08:00:00.000Z', payload: { amount: 1000, delegateId: 'del-1' } },
    { eventType: 'commission_earned', aggregateId: 'del-1', occurredAt: '2026-09-18T08:00:01.000Z', payload: { commissionAmount: 100, delegateId: 'del-1', sourceRechargeId: 'req-1' } },
    { eventType: 'recharge_approved', aggregateId: 'req-2', occurredAt: '2026-09-18T09:00:00.000Z', payload: { amount: 500, delegateId: 'del-2' } },
    { eventType: 'vehicle_refunded', aggregateId: 'vehicle-1', occurredAt: '2026-09-18T10:00:00.000Z', payload: { refundAmount: 50 } },
    { eventType: 'recharge_approved', aggregateId: 'req-old', occurredAt: '2026-09-17T10:00:00.000Z', payload: { amount: 999, delegateId: 'del-1' } }
  ];

  it('derives company totals without double-counting commission events', () => {
    expect(calculateFinancialReport(events, [
      { settlementId: 'set-1', delegateId: 'del-1', settledAt: '2026-09-17T12:00:00.000Z', previousCycleTotal: 750 }
    ], { start: '2026-09-18T00:00:00.000Z', end: '2026-09-19T00:00:00.000Z' })).toEqual({
      grossRechargeTotal: 1500,
      walletTopupTotal: 0,
      cashCollectedTotal: 1500,
      commissionTotal: 100,
      refundTotal: 50,
      companyNetRevenue: 1350,
      historicalSettledTotal: 0,
      currentUnsettledByDelegate: { 'del-1': 1000, 'del-2': 500 }
    });
  });

  it('excludes settled delegate recharge events from the current cycle', () => {
    const report = calculateFinancialReport(events, [
      { settlementId: 'set-1', delegateId: 'del-1', settledAt: '2026-09-18T08:30:00.000Z', previousCycleTotal: 1000 }
    ]);
    expect(report.historicalSettledTotal).toBe(1000);
    expect(report.currentUnsettledByDelegate['del-1']).toBe(0);
    expect(report.currentUnsettledByDelegate['del-2']).toBe(500);
  });

  it('is deterministic for the same event and settlement history', () => {
    const settlements = [{ settlementId: 'set-1', delegateId: 'del-1', settledAt: '2026-09-18T08:30:00.000Z', previousCycleTotal: 1000 }];
    expect(calculateFinancialReport(events, settlements)).toEqual(calculateFinancialReport([...events], [...settlements]));
  });

  it('supports delegate-scoped totals without leaking another delegate\'s recharge', () => {
    const report = calculateFinancialReport(events, [], { delegateId: 'del-1' });
    expect(report.grossRechargeTotal).toBe(1999);
    expect(report.currentUnsettledByDelegate).toEqual({ 'del-1': 1999 });
    expect(report.commissionTotal).toBe(100);
  });

  it('reports wallet credits separately without treating them as subscriptions', () => {
    const report = calculateFinancialReport([
      { eventType: 'wallet_topup_approved', aggregateId: 'garage-1', occurredAt: '2026-09-18T08:00:00.000Z', payload: { amount: 250 } },
      { eventType: 'package_purchased', aggregateId: 'purchase-1', occurredAt: '2026-09-18T09:00:00.000Z', payload: { amount: 200 } },
    ], []);
    expect(report.grossRechargeTotal).toBe(0);
    expect(report.walletTopupTotal).toBe(250);
    expect(report.cashCollectedTotal).toBe(250);
  });

  it('supports delegate-scoped totals without leaking another delegate\'s settlements', () => {
    const report = calculateFinancialReport(events, [
      { settlementId: 'set-1', delegateId: 'del-1', settledAt: '2026-09-18T08:30:00.000Z', previousCycleTotal: 1000 },
      { settlementId: 'set-2', delegateId: 'del-2', settledAt: '2026-09-18T08:30:00.000Z', previousCycleTotal: 500 }
    ], { delegateId: 'del-1' });
    expect(report.historicalSettledTotal).toBe(1000);
    expect(report.currentUnsettledByDelegate).toEqual({ 'del-1': 0 });
  });
});
