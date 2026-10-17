/**
 * Synthetic-only BILL-08 rehearsal for the approved legacy-to-prepaid conversion.
 * This module is intentionally pure: it has no Firestore, HTTP, environment,
 * clock, random-ID, or mutation dependencies and never applies a conversion.
 */

export type RehearsalDateValue = string | number | Date | null | undefined;
export type RehearsalStatus = 'ready' | 'already_prepaid' | 'needs_review';

export type BillingMigrationIssue =
  | 'INVALID_GARAGE_ID'
  | 'INVALID_AS_OF_DATE'
  | 'GARAGE_STATUS_UNKNOWN'
  | 'GARAGE_NOT_APPROVED'
  | 'UNSUPPORTED_BILLING_MODEL'
  | 'MIXED_BILLING_MODEL'
  | 'INVALID_PREPAID_BALANCE'
  | 'TRIAL_REQUIRES_POLICY'
  | 'GARAGE_LOCKED_REQUIRES_REVIEW'
  | 'GARAGE_SUSPENDED_REQUIRES_REVIEW'
  | 'PENDING_REQUEST_STATUS_UNKNOWN'
  | 'PENDING_RECHARGE_REQUESTS'
  | 'INVALID_LEGACY_WALLET_BALANCE'
  | 'INVALID_PLAN_EXPIRY'
  | 'REFERRAL_BONUS_BALANCE_REQUIRES_POLICY'
  | 'UNCLAIMED_REFERRAL_DAYS_REQUIRES_POLICY'
  | 'CREDIT_TOTAL_OVERFLOW';

export interface RehearsalCreditBalance {
  readonly paid: number;
  readonly referral: number;
}

export interface LegacyBillingSnapshot {
  readonly garageId: unknown;
  readonly asOf: RehearsalDateValue;
  readonly status?: unknown;
  readonly billingModel?: unknown;
  readonly creditBalance?: unknown;
  readonly isTrial?: unknown;
  readonly isLocked?: unknown;
  readonly isSuspended?: unknown;
  readonly balanceExpiry?: RehearsalDateValue;
  readonly balance?: unknown;
  readonly pendingRechargeRequestCount?: unknown;
  readonly referralBonusBalance?: unknown;
  readonly totalReferralRewardDays?: unknown;
}

export interface RehearsalCreditEntry {
  readonly source: 'active_plan' | 'legacy_wallet';
  readonly sourceAmount: number;
  readonly sourceUnit: 'remaining_days' | 'EGP';
  readonly credits: number;
}

export interface BillingMigrationRehearsal {
  readonly mode: 'preview_only';
  readonly garageId: string | null;
  readonly status: RehearsalStatus;
  readonly issues: readonly BillingMigrationIssue[];
  readonly asOf: string | null;
  readonly remainingPlanDays: number | null;
  readonly legacyWalletEgp: number | null;
  readonly candidatePlanCredits: number;
  readonly candidateWalletCredits: number;
  readonly convertedPaidCredits: number | null;
  readonly resultingCreditBalance: RehearsalCreditBalance | null;
  readonly creditEntries: readonly RehearsalCreditEntry[];
  readonly historicalReferralDaysNotAdded: number | null;
}

const CREDITS_PER_PLAN_DAY = 10;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value: RehearsalDateValue): Date | null {
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? new Date(millis) : null;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === 'string') {
    // Require an explicit timezone so results do not depend on the host locale.
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function parseNonNegativeInteger(value: unknown, missingAsZero = false): number | null {
  if (value === undefined || value === null) return missingAsZero ? 0 : null;
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    amount = Number(value);
  } else {
    return null;
  }
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function parseCreditBalance(value: unknown): RehearsalCreditBalance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const paid = parseNonNegativeInteger(raw.paid);
  const referral = parseNonNegativeInteger(raw.referral);
  return paid === null || referral === null ? null : { paid, referral };
}

function buildResult(
  values: Omit<BillingMigrationRehearsal, 'mode' | 'garageId'> & { garageId: string | null },
): BillingMigrationRehearsal {
  return { mode: 'preview_only', ...values };
}

/**
 * Calculates a preview using the approved rules: 10 credits per remaining
 * 24-hour plan day (rounded up, matching the legacy garage display) and 1
 * credit per whole EGP in the legacy wallet. No source value is changed.
 *
 * Unknown eligibility, pending requests, trials, unsupported legacy referral
 * value, or mixed billing data stop the preview from producing write entries.
 */
export function rehearseLegacyBillingConversion(input: LegacyBillingSnapshot): BillingMigrationRehearsal {
  const garageId = typeof input.garageId === 'string' && input.garageId.trim() ? input.garageId.trim() : null;
  const issues: BillingMigrationIssue[] = [];
  if (!garageId) issues.push('INVALID_GARAGE_ID');

  const asOfDate = parseDate(input.asOf);
  if (!asOfDate) issues.push('INVALID_AS_OF_DATE');
  const asOf = asOfDate ? asOfDate.toISOString() : null;

  const creditBalancePresent = input.creditBalance !== undefined && input.creditBalance !== null;
  const existingCreditBalance = creditBalancePresent ? parseCreditBalance(input.creditBalance) : null;
  const billingModel = input.billingModel;

  if (billingModel === 'prepaid_credits' || creditBalancePresent) {
    if (!existingCreditBalance) {
      issues.push('INVALID_PREPAID_BALANCE');
      return buildResult({
        garageId,
        status: 'needs_review',
        issues,
        asOf,
        remainingPlanDays: null,
        legacyWalletEgp: null,
        candidatePlanCredits: 0,
        candidateWalletCredits: 0,
        convertedPaidCredits: null,
        resultingCreditBalance: null,
        creditEntries: [],
        historicalReferralDaysNotAdded: null,
      });
    }
    if (billingModel === 'subscription') {
      issues.push('MIXED_BILLING_MODEL');
      return buildResult({
        garageId,
        status: 'needs_review',
        issues,
        asOf,
        remainingPlanDays: null,
        legacyWalletEgp: null,
        candidatePlanCredits: 0,
        candidateWalletCredits: 0,
        convertedPaidCredits: null,
        resultingCreditBalance: null,
        creditEntries: [],
        historicalReferralDaysNotAdded: null,
      });
    }
    if (billingModel !== undefined && billingModel !== null && billingModel !== 'prepaid_credits') {
      issues.push('UNSUPPORTED_BILLING_MODEL');
      return buildResult({
        garageId,
        status: 'needs_review',
        issues,
        asOf,
        remainingPlanDays: null,
        legacyWalletEgp: null,
        candidatePlanCredits: 0,
        candidateWalletCredits: 0,
        convertedPaidCredits: null,
        resultingCreditBalance: null,
        creditEntries: [],
        historicalReferralDaysNotAdded: null,
      });
    }
    if (issues.length > 0) {
      return buildResult({
        garageId,
        status: 'needs_review',
        issues,
        asOf,
        remainingPlanDays: null,
        legacyWalletEgp: null,
        candidatePlanCredits: 0,
        candidateWalletCredits: 0,
        convertedPaidCredits: null,
        resultingCreditBalance: null,
        creditEntries: [],
        historicalReferralDaysNotAdded: null,
      });
    }
    return buildResult({
      garageId,
      status: 'already_prepaid',
      issues: [],
      asOf,
      remainingPlanDays: null,
      legacyWalletEgp: null,
      candidatePlanCredits: 0,
      candidateWalletCredits: 0,
      convertedPaidCredits: 0,
      resultingCreditBalance: existingCreditBalance,
      creditEntries: [],
      historicalReferralDaysNotAdded: null,
    });
  }

  if (billingModel !== undefined && billingModel !== null && billingModel !== 'subscription') {
    issues.push('UNSUPPORTED_BILLING_MODEL');
  }
  if (input.status === undefined || input.status === null || input.status === '') {
    issues.push('GARAGE_STATUS_UNKNOWN');
  } else if (input.status !== 'approved') {
    issues.push('GARAGE_NOT_APPROVED');
  }
  if (input.isTrial === true) issues.push('TRIAL_REQUIRES_POLICY');
  if (input.isLocked === true) issues.push('GARAGE_LOCKED_REQUIRES_REVIEW');
  if (input.isSuspended === true) issues.push('GARAGE_SUSPENDED_REQUIRES_REVIEW');

  const pendingCount = parseNonNegativeInteger(input.pendingRechargeRequestCount);
  if (pendingCount === null) {
    issues.push('PENDING_REQUEST_STATUS_UNKNOWN');
  } else if (pendingCount > 0) {
    issues.push('PENDING_RECHARGE_REQUESTS');
  }

  const legacyWalletEgp = parseNonNegativeInteger(input.balance, true);
  if (legacyWalletEgp === null) issues.push('INVALID_LEGACY_WALLET_BALANCE');

  let remainingPlanDays: number | null = 0;
  if (input.balanceExpiry !== undefined && input.balanceExpiry !== null) {
    const expiry = parseDate(input.balanceExpiry);
    if (!expiry) {
      remainingPlanDays = null;
      issues.push('INVALID_PLAN_EXPIRY');
    } else if (asOfDate) {
      const remainingMillis = expiry.getTime() - asOfDate.getTime();
      remainingPlanDays = Math.max(0, Math.ceil(remainingMillis / MILLIS_PER_DAY));
    } else {
      remainingPlanDays = null;
    }
  }

  const referralBonusBalance = parseNonNegativeInteger(input.referralBonusBalance, true);
  if (referralBonusBalance === null || referralBonusBalance > 0) {
    issues.push('REFERRAL_BONUS_BALANCE_REQUIRES_POLICY');
  }
  const historicalReferralDaysNotAdded = parseNonNegativeInteger(input.totalReferralRewardDays, true);
  if (historicalReferralDaysNotAdded === null || historicalReferralDaysNotAdded > 0) {
    issues.push('UNCLAIMED_REFERRAL_DAYS_REQUIRES_POLICY');
  }

  const candidatePlanCredits = input.isTrial === true || remainingPlanDays === null
    ? 0
    : remainingPlanDays * CREDITS_PER_PLAN_DAY;
  const candidateWalletCredits = legacyWalletEgp ?? 0;
  const totalCredits = candidatePlanCredits + candidateWalletCredits;
  if (!Number.isSafeInteger(candidatePlanCredits) || !Number.isSafeInteger(totalCredits)) {
    issues.push('CREDIT_TOTAL_OVERFLOW');
  }

  if (issues.length > 0) {
    return buildResult({
      garageId,
      status: 'needs_review',
      issues: [...new Set(issues)],
      asOf,
      remainingPlanDays,
      legacyWalletEgp,
      candidatePlanCredits: Number.isSafeInteger(candidatePlanCredits) ? candidatePlanCredits : 0,
      candidateWalletCredits,
      convertedPaidCredits: null,
      resultingCreditBalance: null,
      creditEntries: [],
      historicalReferralDaysNotAdded,
    });
  }

  const creditEntries: RehearsalCreditEntry[] = [];
  if (candidatePlanCredits > 0) {
    creditEntries.push({
      source: 'active_plan',
      sourceAmount: remainingPlanDays || 0,
      sourceUnit: 'remaining_days',
      credits: candidatePlanCredits,
    });
  }
  if (candidateWalletCredits > 0) {
    creditEntries.push({
      source: 'legacy_wallet',
      sourceAmount: candidateWalletCredits,
      sourceUnit: 'EGP',
      credits: candidateWalletCredits,
    });
  }

  return buildResult({
    garageId,
    status: 'ready',
    issues: [],
    asOf,
    remainingPlanDays,
    legacyWalletEgp,
    candidatePlanCredits,
    candidateWalletCredits,
    convertedPaidCredits: totalCredits,
    resultingCreditBalance: { paid: totalCredits, referral: 0 },
    creditEntries,
    historicalReferralDaysNotAdded,
  });
}
