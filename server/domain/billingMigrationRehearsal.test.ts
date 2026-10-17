import { describe, expect, it } from 'vitest';
import { rehearseLegacyBillingConversion, type LegacyBillingSnapshot } from './billingMigrationRehearsal';

const baseSnapshot = (overrides: Partial<LegacyBillingSnapshot> = {}): LegacyBillingSnapshot => ({
  garageId: 'synthetic-garage-1',
  asOf: '2026-10-17T12:00:00.000Z',
  status: 'approved',
  billingModel: 'subscription',
  isTrial: false,
  isLocked: false,
  isSuspended: false,
  balanceExpiry: null,
  balance: 0,
  pendingRechargeRequestCount: 0,
  referralBonusBalance: 0,
  totalReferralRewardDays: 0,
  ...overrides,
});

describe('BILL-08 synthetic billing migration rehearsal', () => {
  it('previews three remaining plan days plus a 125 EGP wallet as 155 paid credits', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({
      balanceExpiry: '2026-10-20T12:00:00.000Z',
      balance: 125,
    }));

    expect(result).toMatchObject({
      mode: 'preview_only',
      status: 'ready',
      remainingPlanDays: 3,
      legacyWalletEgp: 125,
      candidatePlanCredits: 30,
      candidateWalletCredits: 125,
      convertedPaidCredits: 155,
      resultingCreditBalance: { paid: 155, referral: 0 },
      creditEntries: [
        { source: 'active_plan', sourceAmount: 3, sourceUnit: 'remaining_days', credits: 30 },
        { source: 'legacy_wallet', sourceAmount: 125, sourceUnit: 'EGP', credits: 125 },
      ],
    });
  });

  it('uses the same round-up rule as the legacy display for any partial remaining day', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({
      balanceExpiry: '2026-10-17T12:00:00.001Z',
    }));

    expect(result.remainingPlanDays).toBe(1);
    expect(result.convertedPaidCredits).toBe(10);
  });

  it('does not convert expired plan time but still previews an eligible EGP wallet', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({
      balanceExpiry: '2026-10-16T12:00:00.000Z',
      balance: 40,
    }));

    expect(result).toMatchObject({
      status: 'ready',
      remainingPlanDays: 0,
      candidatePlanCredits: 0,
      candidateWalletCredits: 40,
      convertedPaidCredits: 40,
      creditEntries: [{ source: 'legacy_wallet', sourceAmount: 40, sourceUnit: 'EGP', credits: 40 }],
    });
  });

  it('does not convert already-prepaid garages again', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({
      billingModel: 'prepaid_credits',
      creditBalance: { paid: 42, referral: 3 },
      balanceExpiry: '2026-10-20T12:00:00.000Z',
      balance: 125,
    }));

    expect(result).toMatchObject({
      status: 'already_prepaid',
      convertedPaidCredits: 0,
      resultingCreditBalance: { paid: 42, referral: 3 },
      creditEntries: [],
    });
  });

  it('flags mixed legacy and prepaid records for review rather than choosing a source', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({
      billingModel: 'subscription',
      creditBalance: { paid: 5, referral: 0 },
    }));

    expect(result.status).toBe('needs_review');
    expect(result.issues).toContain('MIXED_BILLING_MODEL');
    expect(result.convertedPaidCredits).toBeNull();
    expect(result.creditEntries).toEqual([]);
  });

  it('previews remaining free-trial time as separate non-expiring Trial credits', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({
      isTrial: true,
      balanceExpiry: '2026-10-20T12:00:00.000Z',
      balance: 20,
    }));

    expect(result.status).toBe('ready');
    expect(result.candidatePlanCredits).toBe(0);
    expect(result.candidateTrialCredits).toBe(30);
    expect(result.convertedPaidCredits).toBe(20);
    expect(result.convertedTrialCredits).toBe(30);
    expect(result.resultingCreditBalance).toEqual({ paid: 20, referral: 0, trial: 30 });
    expect(result.creditEntries).toContainEqual({ source: 'trial_time', sourceAmount: 3, sourceUnit: 'remaining_days', credits: 30 });
  });

  it('requires a known clear pending-request state before a preview can be ready', () => {
    const unknown = rehearseLegacyBillingConversion(baseSnapshot({ pendingRechargeRequestCount: undefined }));
    const pending = rehearseLegacyBillingConversion(baseSnapshot({ pendingRechargeRequestCount: 1 }));

    expect(unknown.issues).toContain('PENDING_REQUEST_STATUS_UNKNOWN');
    expect(pending.issues).toContain('PENDING_RECHARGE_REQUESTS');
    expect(unknown.convertedPaidCredits).toBeNull();
    expect(pending.convertedPaidCredits).toBeNull();
  });

  it('flags legacy referral cash and unclaimed day rewards instead of silently converting them', () => {
    const cash = rehearseLegacyBillingConversion(baseSnapshot({ referralBonusBalance: 2 }));
    const days = rehearseLegacyBillingConversion(baseSnapshot({ totalReferralRewardDays: 4 }));

    expect(cash.issues).toContain('REFERRAL_BONUS_BALANCE_REQUIRES_POLICY');
    expect(days.issues).toContain('UNCLAIMED_REFERRAL_DAYS_REQUIRES_POLICY');
    expect(cash.convertedPaidCredits).toBeNull();
    expect(days.convertedPaidCredits).toBeNull();
  });

  it.each([-1, 1.5, '1.5', true, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid or non-whole-EGP legacy wallet value %s',
    (balance) => {
      const result = rehearseLegacyBillingConversion(baseSnapshot({ balance }));
      expect(result.status).toBe('needs_review');
      expect(result.issues).toContain('INVALID_LEGACY_WALLET_BALANCE');
      expect(result.convertedPaidCredits).toBeNull();
    },
  );

  it('flags a malformed plan expiry rather than treating it as zero remaining days', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({ balanceExpiry: 'not-a-date' }));

    expect(result.status).toBe('needs_review');
    expect(result.issues).toContain('INVALID_PLAN_EXPIRY');
    expect(result.convertedPaidCredits).toBeNull();
  });

  it('requires a known approved garage status and no lock or suspension', () => {
    const unknown = rehearseLegacyBillingConversion(baseSnapshot({ status: undefined }));
    const pending = rehearseLegacyBillingConversion(baseSnapshot({ status: 'pending' }));
    const locked = rehearseLegacyBillingConversion(baseSnapshot({ isLocked: true }));
    const suspended = rehearseLegacyBillingConversion(baseSnapshot({ isSuspended: true }));

    expect(unknown.issues).toContain('GARAGE_STATUS_UNKNOWN');
    expect(pending.issues).toContain('GARAGE_NOT_APPROVED');
    expect(locked.issues).toContain('GARAGE_LOCKED_REQUIRES_REVIEW');
    expect(suspended.issues).toContain('GARAGE_SUSPENDED_REQUIRES_REVIEW');
    expect([unknown, pending, locked, suspended].every((result) => result.convertedPaidCredits === null)).toBe(true);
  });

  it('allows an approved legacy garage whose billing model was never explicitly saved', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({ billingModel: undefined, balance: 7 }));

    expect(result.status).toBe('ready');
    expect(result.convertedPaidCredits).toBe(7);
  });

  it('flags a credit total that would overflow the safe integer range', () => {
    const result = rehearseLegacyBillingConversion(baseSnapshot({
      balance: Number.MAX_SAFE_INTEGER,
      balanceExpiry: '2026-10-17T12:00:00.001Z',
    }));

    expect(result.status).toBe('needs_review');
    expect(result.issues).toContain('CREDIT_TOTAL_OVERFLOW');
    expect(result.convertedPaidCredits).toBeNull();
    expect(result.creditEntries).toEqual([]);
  });

  it('does not mutate the synthetic source snapshot', () => {
    const input = baseSnapshot({ balanceExpiry: '2026-10-20T12:00:00.000Z', balance: 125 });
    const before = structuredClone(input);

    rehearseLegacyBillingConversion(input);

    expect(input).toEqual(before);
  });
});
