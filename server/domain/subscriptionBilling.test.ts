import { describe, expect, it } from 'vitest';
import {
  applyReferralReward,
  decideReferralReward,
  extendSubscriptionExpiry
} from './subscriptionBilling';

describe('subscription billing decisions', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');

  it('extends from now when the current expiry is missing, invalid, or in the past', () => {
    expect(extendSubscriptionExpiry(undefined, 3, now).toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(extendSubscriptionExpiry('not-a-date', 3, now).toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(extendSubscriptionExpiry('2026-10-01T12:00:00.000Z', 3, now).toISOString()).toBe('2026-10-08T12:00:00.000Z');
  });

  it('extends from a future expiry rather than shortening the active subscription', () => {
    expect(extendSubscriptionExpiry('2026-10-10T12:00:00.000Z', 3, now).toISOString()).toBe('2026-10-13T12:00:00.000Z');
  });

  it('preserves the approval-request referral rule without requiring a positive price', () => {
    expect(decideReferralReward({
      referrerGarageId: 'referrer', targetGarageId: 'target', durationDays: 15
    })).toEqual({ eligible: true, rewardDays: 1 });
    expect(decideReferralReward({
      referrerGarageId: 'referrer', targetGarageId: 'target', durationDays: 15, price: 0, requiresPositivePrice: true
    })).toEqual({ eligible: false, rewardDays: 0 });
  });

  it('denies self-referrals and subscriptions shorter than the threshold', () => {
    expect(decideReferralReward({
      referrerGarageId: 'target', targetGarageId: 'target', durationDays: 30
    }).eligible).toBe(false);
    expect(decideReferralReward({
      referrerGarageId: 'referrer', targetGarageId: 'target', durationDays: 14
    }).eligible).toBe(false);
    expect(decideReferralReward({
      referrerGarageId: undefined, targetGarageId: 'target', durationDays: 30
    }).eligible).toBe(false);
  });

  it('applies the one-day reward from the referrer’s active expiry', () => {
    expect(applyReferralReward('2026-10-10T12:00:00.000Z', 1, now).toISOString()).toBe('2026-10-11T12:00:00.000Z');
  });
});
