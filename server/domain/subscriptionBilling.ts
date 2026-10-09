export type BillingDateLike = Date | string | number | Readonly<{
  toDate?: () => BillingDateLike;
}>;

export interface ReferralEligibilityInput {
  readonly referrerGarageId?: unknown;
  readonly targetGarageId: string;
  readonly durationDays: number;
  readonly price?: number;
  readonly requiresPositivePrice?: boolean;
}

export interface ReferralRewardDecision {
  readonly eligible: boolean;
  readonly rewardDays: number;
}

function toValidDate(value: BillingDateLike | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    return toValidDate(value.toDate());
  }
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Extends from the later of now and a valid current expiry, preserving calendar-day semantics. */
export function extendSubscriptionExpiry(
  currentExpiry: BillingDateLike | undefined,
  durationDays: number,
  now: Date = new Date(),
): Date {
  const nowDate = new Date(now.getTime());
  const currentDate = toValidDate(currentExpiry);
  const baseDate = currentDate && currentDate.getTime() > nowDate.getTime() ? currentDate : nowDate;
  baseDate.setDate(baseDate.getDate() + durationDays);
  return baseDate;
}

/**
 * Decides whether a qualifying subscription should grant the one-day referral
 * reward. The positive-price requirement is explicit because the legacy
 * approval-request path intentionally did not apply that extra condition.
 */
export function decideReferralReward(input: ReferralEligibilityInput): ReferralRewardDecision {
  const hasDifferentReferrer = Boolean(input.referrerGarageId) && input.referrerGarageId !== input.targetGarageId;
  const hasRequiredDuration = input.durationDays >= 15;
  const hasRequiredPrice = !input.requiresPositivePrice || Number(input.price || 0) > 0;
  return {
    eligible: hasDifferentReferrer && hasRequiredDuration && hasRequiredPrice,
    rewardDays: hasDifferentReferrer && hasRequiredDuration && hasRequiredPrice ? 1 : 0,
  };
}

/** Extends an existing referrer subscription by the decision’s reward days. */
export function applyReferralReward(
  currentExpiry: BillingDateLike | undefined,
  rewardDays: number,
  now: Date = new Date(),
): Date {
  return extendSubscriptionExpiry(currentExpiry, rewardDays, now);
}
