import { describe, expect, it } from 'vitest';
import { calculateFinancialReport } from './financialReporting';

const emptyCreditActivity = {
  paidGrantCount: 0,
  paidCreditsGranted: 0,
  paidGrantCountWithoutEgpRecord: 0,
  paidCreditsWithoutEgpRecord: 0,
  referralAwardCount: 0,
  referralCreditsGranted: 0,
  trialGrantCount: 0,
  trialCreditsGranted: 0,
  regularEntryDebitCount: 0,
  regularEntryCreditsConsumed: 0,
  regularEntryPaidCreditsConsumed: 0,
  regularEntryReferralCreditsConsumed: 0,
  regularEntryTrialCreditsConsumed: 0,
  subscriberRenewalCount: 0,
  subscriberRenewalCreditsConsumed: 0,
  correctionRestoreCount: 0,
  restoredCredits: 0,
  restoredPaidCredits: 0,
  restoredReferralCredits: 0,
  restoredTrialCredits: 0,
};

const events = [
  { eventType: 'recharge_approved', aggregateId: 'req-1', occurredAt: '2026-09-18T08:00:00.000Z', payload: { amount: 1000, delegateId: 'del-1' } },
  { eventType: 'commission_earned', aggregateId: 'del-1', occurredAt: '2026-09-18T08:00:01.000Z', payload: { commissionAmount: 100, delegateId: 'del-1', sourceRechargeId: 'req-1' } },
  { eventType: 'recharge_approved', aggregateId: 'req-2', occurredAt: '2026-09-18T09:00:00.000Z', payload: { amount: 500, delegateId: 'del-2' } },
  { eventType: 'vehicle_refunded', aggregateId: 'vehicle-1', occurredAt: '2026-09-18T10:00:00.000Z', payload: { refundAmount: 50 } },
  { eventType: 'recharge_approved', aggregateId: 'req-old', occurredAt: '2026-09-17T10:00:00.000Z', payload: { amount: 999, delegateId: 'del-1' } }
];

describe('financial reporting projections', () => {
  it('derives company totals without double-counting commission events', () => {
    expect(calculateFinancialReport(events, [
      { settlementId: 'set-1', delegateId: 'del-1', settledAt: '2026-09-17T12:00:00.000Z', previousCycleTotal: 750 }
    ], { start: '2026-09-18T00:00:00.000Z', end: '2026-09-19T00:00:00.000Z' })).toEqual({
      grossRechargeTotal: 1500,
      walletTopupTotal: 0,
      prepaidCreditPaymentsEgp: 0,
      cashCollectedTotal: 1500,
      commissionTotal: 100,
      refundTotal: 50,
      companyNetRevenue: 1350,
      historicalSettledTotal: 0,
      currentUnsettledByDelegate: { 'del-1': 1000, 'del-2': 500 },
      creditActivity: emptyCreditActivity,
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

  it('supports delegate-scoped totals without exposing all-garage credit metrics', () => {
    const report = calculateFinancialReport(events, [], { delegateId: 'del-1' });
    expect(report.grossRechargeTotal).toBe(1999);
    expect(report.currentUnsettledByDelegate).toEqual({ 'del-1': 1999 });
    expect(report.commissionTotal).toBe(100);
    expect(report.prepaidCreditPaymentsEgp).toBeNull();
    expect(report.creditActivity).toBeNull();
  });

  it('reports wallet credits separately without treating them as subscriptions', () => {
    const report = calculateFinancialReport([
      { eventType: 'wallet_topup_approved', aggregateId: 'garage-1', occurredAt: '2026-09-18T08:00:00.000Z', payload: { amount: 250 } },
      { eventType: 'package_purchased', aggregateId: 'purchase-1', occurredAt: '2026-09-18T09:00:00.000Z', payload: { amount: 200 } },
    ], []);
    expect(report.grossRechargeTotal).toBe(0);
    expect(report.walletTopupTotal).toBe(250);
    expect(report.prepaidCreditPaymentsEgp).toBe(0);
    expect(report.cashCollectedTotal).toBe(250);
  });

  it('reports transfer EGP and each credit activity type in separate units', () => {
    const report = calculateFinancialReport([
      { eventType: 'prepaid_credit_grant_paid', aggregateId: 'g1', occurredAt: '2026-09-18T08:00:00.000Z', payload: { amount: 50, creditAmount: 50, creditLedgerEntryId: 'g1' } },
      { eventType: 'prepaid_credit_grant_paid', aggregateId: 'g-old', occurredAt: '2026-09-17T08:00:00.000Z', payload: { amount: 100, creditAmount: 100 } },
    ], [], { start: '2026-09-18T00:00:00.000Z', end: '2026-09-19T00:00:00.000Z' }, [
      { kind: 'paid_grant', bucket: 'paid', amount: 50, paymentAmountEgp: 50, occurredAt: '2026-09-18T08:00:00.000Z' },
      { kind: 'referral_award', bucket: 'referral', amount: 20, occurredAt: '2026-09-18T08:01:00.000Z' },
      { kind: 'regular_entry_debit', bucket: 'paid', amount: 1, occurredAt: '2026-09-18T08:02:00.000Z' },
      { kind: 'regular_entry_debit', bucket: 'referral', amount: 1, occurredAt: '2026-09-18T08:03:00.000Z' },
      { kind: 'subscriber_renewal_debit', bucket: 'paid', amount: 5, occurredAt: '2026-09-18T08:04:00.000Z' },
      { kind: 'correction_restore', bucket: 'referral', amount: 1, occurredAt: '2026-09-18T08:05:00.000Z' },
      { kind: 'regular_entry_debit', bucket: 'paid', amount: 0.5, occurredAt: '2026-09-18T08:06:00.000Z' },
      { kind: 'paid_grant', bucket: 'paid', amount: 200, occurredAt: '2026-09-19T00:00:00.000Z' },
    ]);

    expect(report.prepaidCreditPaymentsEgp).toBe(50);
    expect(report.cashCollectedTotal).toBe(0);
    expect(report.companyNetRevenue).toBe(0);
    expect(report.creditActivity).toEqual({
      paidGrantCount: 1,
      paidCreditsGranted: 50,
      paidGrantCountWithoutEgpRecord: 0,
      paidCreditsWithoutEgpRecord: 0,
      referralAwardCount: 1,
      referralCreditsGranted: 20,
      trialGrantCount: 0,
      trialCreditsGranted: 0,
      regularEntryDebitCount: 2,
      regularEntryCreditsConsumed: 2,
      regularEntryPaidCreditsConsumed: 1,
      regularEntryReferralCreditsConsumed: 1,
      regularEntryTrialCreditsConsumed: 0,
      subscriberRenewalCount: 1,
      subscriberRenewalCreditsConsumed: 5,
      correctionRestoreCount: 1,
      restoredCredits: 1,
      restoredPaidCredits: 0,
      restoredReferralCredits: 1,
      restoredTrialCredits: 0,
    });
  });

  it('supports delegate-scoped totals without leaking another delegate\'s settlements', () => {
    const report = calculateFinancialReport(events, [
      { settlementId: 'set-1', delegateId: 'del-1', settledAt: '2026-09-18T08:30:00.000Z', previousCycleTotal: 1000 },
      { settlementId: 'set-2', delegateId: 'del-2', settledAt: '2026-09-18T08:30:00.000Z', previousCycleTotal: 500 }
    ], { delegateId: 'del-1' });
    expect(report.historicalSettledTotal).toBe(1000);
    expect(report.currentUnsettledByDelegate).toEqual({ 'del-1': 0 });
  });

  it('skips malformed legacy money and credit values and keeps every total finite', () => {
    const report = calculateFinancialReport([
      { eventType: 'recharge_approved', aggregateId: 'r1', occurredAt: '2026-09-18T08:00:00.000Z', payload: { amount: 100.25, delegateId: 'del-1' } },
      { eventType: 'recharge_approved', aggregateId: 'r2', occurredAt: '2026-09-18T08:01:00.000Z', payload: { amount: '0.75', delegateId: 'del-1' } },
      { eventType: 'recharge_approved', aggregateId: 'r3', occurredAt: '2026-09-18T08:02:00.000Z', payload: { amount: -1, delegateId: 'del-1' } },
      { eventType: 'recharge_approved', aggregateId: 'r4', occurredAt: '2026-09-18T08:03:00.000Z', payload: { amount: Number.NaN, delegateId: 'del-1' } },
      { eventType: 'recharge_approved', aggregateId: 'r5', occurredAt: '2026-09-18T08:04:00.000Z', payload: { amount: Number.POSITIVE_INFINITY, delegateId: 'del-1' } },
      { eventType: 'recharge_approved', aggregateId: 'r6', occurredAt: '2026-09-18T08:05:00.000Z', payload: { amount: 1.234, delegateId: 'del-1' } },
      { eventType: 'wallet_topup_approved', occurredAt: '2026-09-18T08:06:00.000Z', payload: { amount: 25.5 } },
      { eventType: 'wallet_topup_approved', occurredAt: '2026-09-18T08:07:00.000Z', payload: { amount: -2 } },
      { eventType: 'prepaid_credit_grant_paid', occurredAt: '2026-09-18T08:08:00.000Z', payload: { amount: 40, creditAmount: 40, creditLedgerEntryId: 'g40' } },
      { eventType: 'prepaid_credit_grant_paid', occurredAt: '2026-09-18T08:09:00.000Z', payload: { amount: '41', creditAmount: 41 } },
      { eventType: 'commission_earned', occurredAt: '2026-09-18T08:10:00.000Z', payload: { commissionAmount: 5 } },
      { eventType: 'commission_earned', occurredAt: '2026-09-18T08:11:00.000Z', payload: { commissionAmount: Number.NaN } },
      { eventType: 'vehicle_refunded', occurredAt: '2026-09-18T08:12:00.000Z', payload: { refundAmount: 7 } },
      { eventType: 'vehicle_refunded', occurredAt: '2026-09-18T08:13:00.000Z', payload: { refundAmount: Number.POSITIVE_INFINITY } }
    ], [
      { settlementId: 's1', settledAt: '2026-09-18T08:14:00.000Z', previousCycleTotal: 10 },
      { settlementId: 's2', settledAt: '2026-09-18T08:15:00.000Z', previousCycleTotal: Number.NaN },
      { settlementId: 's3', settledAt: '2026-09-18T08:16:00.000Z', previousCycleTotal: -3 }
    ], {}, [
      { kind: 'paid_grant', bucket: 'paid', amount: 10, occurredAt: '2026-09-18T08:17:00.000Z' },
      { kind: 'paid_grant', bucket: 'paid', amount: 1.5, occurredAt: '2026-09-18T08:18:00.000Z' },
    ]);

    expect(report).toMatchObject({
      grossRechargeTotal: 101,
      walletTopupTotal: 25.5,
      prepaidCreditPaymentsEgp: 40,
      cashCollectedTotal: 126.5,
      commissionTotal: 5,
      refundTotal: 7,
      companyNetRevenue: 89,
      historicalSettledTotal: 10,
      currentUnsettledByDelegate: { 'del-1': 101 },
      creditActivity: { paidGrantCount: 1, paidCreditsGranted: 10, paidGrantCountWithoutEgpRecord: 1, paidCreditsWithoutEgpRecord: 10 },
    });
    expect([
      report.grossRechargeTotal,
      report.walletTopupTotal,
      report.prepaidCreditPaymentsEgp,
      report.cashCollectedTotal,
      report.commissionTotal,
      report.refundTotal,
      report.companyNetRevenue,
      report.historicalSettledTotal,
      ...Object.values(report.currentUnsettledByDelegate),
      ...Object.values(report.creditActivity || {}),
    ].every(Number.isFinite)).toBe(true);
  });
});
