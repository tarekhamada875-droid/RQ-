import { describe, test, expect, vi } from 'vitest';
import { 
  isSubscriptionExpired, 
  getRemainingSubscriptionInfo, 
  calculateFinalPrice, 
  applyMonthlySubscribersFlatFee, 
  packageIdToDays, 
  validateRechargeRequest,
  throttleSnapshot
} from '../utils';
import { getCleanPackageInfo } from '../constants/packages';

describe('getRemainingSubscriptionInfo', () => {
  test('returns 1 day and isUrgentRed=false when 20 hours remain (e.g. 1-day package just charged)', () => {
    const future20Hours = new Date(Date.now() + 20 * 60 * 60 * 1000);
    const info = getRemainingSubscriptionInfo({ balanceExpiry: future20Hours });
    expect(info.isUrgentRed).toBe(false);
    expect(info.unit).toBe('days');
    expect(info.displayCount).toBe(1);
    expect(info.remainingHours).toBe(20);
  });

  test('returns hours and isUrgentRed=true when 5 hours remain', () => {
    const future5Hours = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const info = getRemainingSubscriptionInfo({ balanceExpiry: future5Hours });
    expect(info.isUrgentRed).toBe(true);
    expect(info.unit).toBe('hours');
    expect(info.displayCount).toBe(5);
  });

  test('returns hours and isUrgentRed=true when 3 hours remain', () => {
    const future3Hours = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const info = getRemainingSubscriptionInfo({ balanceExpiry: future3Hours });
    expect(info.isUrgentRed).toBe(true);
    expect(info.unit).toBe('hours');
    expect(info.displayCount).toBe(3);
  });

  test('returns isUrgentRed=true and displayCount=0 when expired', () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 30);
    const info = getRemainingSubscriptionInfo({ balanceExpiry: pastDate });
    expect(info.isUrgentRed).toBe(true);
    expect(info.displayCount).toBe(0);
  });
});

describe('isSubscriptionExpired', () => {
  test('returns true for garage with no balanceExpiry', () => {
    expect(isSubscriptionExpired({})).toBe(true);
    expect(isSubscriptionExpired(null)).toBe(true);
  });

  test('returns false for active subscription', () => {
    const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days from now
    expect(isSubscriptionExpired({ balanceExpiry: futureDate })).toBe(false);
  });

  test('returns true for expired subscription', () => {
    const pastDate = new Date(Date.now() - 86400000); // yesterday
    expect(isSubscriptionExpired({ balanceExpiry: pastDate })).toBe(true);
  });
});

describe('calculateFinalPrice', () => {
  test('returns base price when no discount and no subscribers', () => {
    const result = calculateFinalPrice({ price: 1000 }, false);
    expect(result.finalPrice).toBe(1000);
    expect(result.hasDiscount).toBe(false);
  });

  test('applies 500 EGP flat fee for monthly subscribers by default', () => {
    const result = calculateFinalPrice({ price: 1000 }, true);
    expect(result.finalPrice).toBe(1500);
  });

  test('applies custom configured flat fee for monthly subscribers', () => {
    const result = calculateFinalPrice({ price: 1000 }, true, 300);
    expect(result.finalPrice).toBe(1300);
  });

  test('applies percentage discount correctly', () => {
    const result = calculateFinalPrice({ price: 1000, discountType: 'percentage', discountValue: 20 }, false);
    expect(result.finalPrice).toBe(800);
    expect(result.hasDiscount).toBe(true);
  });

  test('applies fixed discount correctly', () => {
    const result = calculateFinalPrice({ price: 1000, discountType: 'fixed', discountValue: 200 }, false);
    expect(result.finalPrice).toBe(800);
  });

  test('applies discount then flat fee', () => {
    const result = calculateFinalPrice({ price: 1000, discountType: 'percentage', discountValue: 20 }, true);
    // 1000 - 20% = 800, then 800 + 500 = 1300
    expect(result.finalPrice).toBe(1300);
  });

  test('applies delegate referral commission correctly on final price', () => {
    // 1-day package with 50% discount: 100 base -> 50 discounted + 5 delegate fee = 55 finalPrice
    const dailyResult = calculateFinalPrice({ price: 100, durationDays: 1, discountType: 'percentage', discountValue: 50 }, false, 500, 5);
    expect(dailyResult.basePrice).toBe(100);
    expect(dailyResult.displayBasePrice).toBe(100);
    expect(dailyResult.finalPrice).toBe(55);

    // 30-day package with 50% discount: 1000 base -> 500 discounted + 50 delegate fee = 550 finalPrice
    const monthlyResult = calculateFinalPrice({ price: 1000, durationDays: 30, discountType: 'percentage', discountValue: 50 }, false, 500, 50);
    expect(monthlyResult.basePrice).toBe(1000);
    expect(monthlyResult.displayBasePrice).toBe(1000);
    expect(monthlyResult.finalPrice).toBe(550);
  });

  test('applies custom delegate commissions object for daily, weekly, biweekly, and monthly packages', () => {
    const customCommissions = { daily: 10, weekly: 20, biweekly: 40, monthly: 80 };

    const daily = calculateFinalPrice({ price: 100, durationDays: 1 }, false, 500, customCommissions);
    expect(daily.actualReferralFee).toBe(10);
    expect(daily.finalPrice).toBe(110);

    const weekly = calculateFinalPrice({ price: 400, durationDays: 7 }, false, 500, customCommissions);
    expect(weekly.actualReferralFee).toBe(20);
    expect(weekly.finalPrice).toBe(420);

    const biweekly = calculateFinalPrice({ price: 800, durationDays: 15 }, false, 500, customCommissions);
    expect(biweekly.actualReferralFee).toBe(40);
    expect(biweekly.finalPrice).toBe(840);

    const monthly = calculateFinalPrice({ price: 1500, durationDays: 30 }, false, 500, customCommissions);
    expect(monthly.actualReferralFee).toBe(80);
    expect(monthly.finalPrice).toBe(1580);
  });
});

describe('applyMonthlySubscribersFlatFee', () => {
  test('returns same price without subscribers', () => {
    expect(applyMonthlySubscribersFlatFee(750, false)).toBe(750);
  });

  test('applies 500 EGP flat fee with subscribers by default', () => {
    expect(applyMonthlySubscribersFlatFee(750, true)).toBe(1250); // 750 + 500 = 1250
  });

  test('applies custom configured flat fee with subscribers', () => {
    expect(applyMonthlySubscribersFlatFee(750, true, 150)).toBe(900); // 750 + 150 = 900
  });
});

describe('packageIdToDays', () => {
  test('daily = 1 day', () => {
    expect(packageIdToDays('daily_sub')).toBe(1);
    expect(packageIdToDays('1day')).toBe(1);
    expect(packageIdToDays('custom', 'باقة يومي (50 سيارة)')).toBe(1);
    expect(packageIdToDays('custom', 'شحن 1 يوم')).toBe(1);
  });

  test('weekly = 7 days', () => {
    expect(packageIdToDays('weekly_sub')).toBe(7);
  });

  test('biweekly = 15 days', () => {
    expect(packageIdToDays('biweekly_sub')).toBe(15);
  });

  test('monthly = 30 days', () => {
    expect(packageIdToDays('monthly_sub')).toBe(30);
  });

  test('defaults to 30 for unknown', () => {
    expect(packageIdToDays('unknown')).toBe(30);
  });
});

describe('validateRechargeRequest', () => {
  test('validates delegate-created request with amount and carsCount', () => {
    const req = {
      garageId: 'gar-123',
      packageId: 'silver_pkg',
      packageName: 'الباقة الفضية (40 سيارة/يوم)',
      amount: 360,
      carsCount: 15,
      delegateId: 'del-123'
    };
    const result = validateRechargeRequest(req);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validates request with revenueAmount', () => {
    const req = {
      garageId: 'gar-456',
      packageId: 'custom',
      revenueAmount: 500,
      durationDays: 30
    };
    const result = validateRechargeRequest(req);
    expect(result.valid).toBe(true);
  });

  test('fails if garageId is missing', () => {
    const req = {
      packageId: 'custom',
      amount: 500
    };
    const result = validateRechargeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('معرف الجراج مطلوب');
  });

  test('fails if package is missing', () => {
    const req = {
      garageId: 'gar-123',
      amount: 500
    };
    const result = validateRechargeRequest(req);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('الباقة مطلوبة');
  });
});

describe('getCleanPackageInfo', () => {
  test('accurately parses 1 day / daily package', () => {
    const pkg1: any = { id: 'daily_sub', name: 'باقة يومي (50 سيارة)', price: 30, dailyCapacity: 50 };
    const info1 = getCleanPackageInfo(pkg1);
    expect(info1.durationDays).toBe(1);
    expect(info1.durationText).toBe('يوم واحد (1 يوم)');
    expect(info1.dailyCapacity).toBe(50);
    expect(info1.isUnlimited).toBe(false);

    const pkg2: any = { id: 'pkg_1day', name: 'شحن 1 يوم سعة مفتوحة', price: 50 };
    const info2 = getCleanPackageInfo(pkg2);
    expect(info2.durationDays).toBe(1);
    expect(info2.isUnlimited).toBe(true);
  });

  test('accurately parses 15 day and 30 day packages', () => {
    const pkg15: any = { id: 'biweekly_sub', name: 'باقة 15 يوم (40 سيارة)', price: 400 };
    expect(getCleanPackageInfo(pkg15).durationDays).toBe(15);

    const pkg30: any = { id: 'monthly_sub', name: 'باقة شهر (100 سيارة)', price: 750 };
    expect(getCleanPackageInfo(pkg30).durationDays).toBe(30);
  });
});

describe('throttleSnapshot', () => {
  test('executes immediately on first call and throttles rapid subsequent calls', () => {
    vi.useFakeTimers();
    const mockFn = vi.fn();
    const throttled = throttleSnapshot(mockFn, 1000);

    throttled(['item1']);
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith(['item1']);

    // Rapid second call within 1000ms
    throttled(['item1', 'item2']);
    expect(mockFn).toHaveBeenCalledTimes(1);

    // Advance time by 1000ms
    vi.advanceTimersByTime(1000);
    expect(mockFn).toHaveBeenCalledTimes(2);
    expect(mockFn).toHaveBeenLastCalledWith(['item1', 'item2']);

    vi.useRealTimers();
  });
});


