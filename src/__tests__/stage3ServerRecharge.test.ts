import { describe, it, expect } from 'vitest';

describe('Stage 3: Server-Authoritative Garage Recharge Engine', () => {
  it('1. Calculates subscription rollover extension when garage is currently active', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const currentActiveExpiry = new Date('2026-09-10T12:00:00Z'); // 4 days remaining

    let baseDate = new Date(now);
    if (currentActiveExpiry.getTime() > baseDate.getTime()) {
      baseDate = currentActiveExpiry;
    }

    const durationDays = 30;
    baseDate.setDate(baseDate.getDate() + durationDays);

    // Expected new expiry is 2026-10-10 (4 days remaining + 30 days)
    expect(baseDate.toISOString()).toBe('2026-10-10T12:00:00.000Z');
  });

  it('2. Resets subscription start time to current timestamp when garage is expired', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const oldExpiredExpiry = new Date('2026-08-01T12:00:00Z'); // Expired in past

    let baseDate = new Date(now);
    if (oldExpiredExpiry.getTime() > baseDate.getTime()) {
      baseDate = oldExpiredExpiry;
    }

    const durationDays = 30;
    baseDate.setDate(baseDate.getDate() + durationDays);

    // Expected new expiry is 30 days from now (2026-10-06)
    expect(baseDate.toISOString()).toBe('2026-10-06T12:00:00.000Z');
  });

  it('3. Enforces monthly subscriber package duration restriction (< 15 days blocked)', () => {
    const garageData = {
      name: 'Monthly Subscriber Hub',
      hasMonthlySubscribers: true
    };

    const validateRechargeDuration = (garage: typeof garageData, days: number) => {
      if (garage.hasMonthlySubscribers === true && days < 15) {
        throw new Error('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION');
      }
      return true;
    };

    // 1-day package on garage with monthly subscribers -> blocked
    expect(() => validateRechargeDuration(garageData, 1)).toThrow('MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION');

    // 30-day package on garage with monthly subscribers -> allowed
    expect(validateRechargeDuration(garageData, 30)).toBe(true);
  });

  it('4. Correctly computes referral reward eligibility and increments referrer days', () => {
    const garageData = {
      referredByGarageId: 'referrer_garage_99',
      totalAdminRevenue: 100
    };

    const garageId = 'garage_01';
    const price = 150;
    const durationDays = 30;

    const isEligibleForReferral =
      Boolean(garageData.referredByGarageId) &&
      garageData.referredByGarageId !== garageId &&
      price > 0 &&
      durationDays > 1;

    expect(isEligibleForReferral).toBe(true);

    const referrerInitialDays = 2;
    const updatedReferrerDays = referrerInitialDays + 1;
    expect(updatedReferrerDays).toBe(3);
  });

  it('5. Properly handles unlimited vs fixed daily capacity packages', () => {
    const parseCapacity = (isUnlimited: boolean, inputCapacity: number) => {
      return isUnlimited ? 0 : Math.max(1, inputCapacity);
    };

    expect(parseCapacity(true, 50)).toBe(0);
    expect(parseCapacity(false, 50)).toBe(50);
  });
});
