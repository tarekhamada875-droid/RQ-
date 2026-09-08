import { describe, it, expect } from 'vitest';
import { Package } from '../types';
import { filterPackagesForGarage, getDefaultDurationFilter, getCleanPackageInfo } from '../constants/packages';
import { getPackageRechargeRestrictions } from '../utils';

describe('Monthly Subscribers Package Restrictions', () => {
  const samplePackages: Package[] = [
    { id: 'daily_50', name: 'باقة 50 سيارة - 1 يوم', price: 10, durationDays: 1, dailyCapacity: 50, vehiclesCount: 1, isActive: true },
    { id: 'biweekly_50', name: 'باقة 50 سيارة - 15 يوم', price: 150, durationDays: 15, dailyCapacity: 50, vehiclesCount: 15, isActive: true },
    { id: 'monthly_50', name: 'باقة 50 سيارة - 30 يوم', price: 300, durationDays: 30, dailyCapacity: 50, vehiclesCount: 30, isActive: true },
    { id: 'monthly_unlimited', name: 'باقة سعة مفتوحة - 30 يوم', price: 450, durationDays: 30, dailyCapacity: 0, vehiclesCount: 30, isActive: true }
  ];

  it('filters out non-30-day packages when garage hasMonthlySubscribers is true', () => {
    const filtered = filterPackagesForGarage(samplePackages, true);
    expect(filtered.length).toBe(2);
    filtered.forEach(pkg => {
      const info = getCleanPackageInfo(pkg);
      expect(info.durationDays).toBe(30);
    });
  });

  it('keeps all packages when garage hasMonthlySubscribers is false or undefined', () => {
    const filteredFalse = filterPackagesForGarage(samplePackages, false);
    expect(filteredFalse.length).toBe(samplePackages.length);

    const filteredUndefined = filterPackagesForGarage(samplePackages);
    expect(filteredUndefined.length).toBe(samplePackages.length);
  });

  it('returns 30 as default duration filter when hasMonthlySubscribers is true', () => {
    const defaultDuration = getDefaultDurationFilter(samplePackages, true);
    expect(defaultDuration).toBe(30);
  });

  it('getPackageRechargeRestrictions forbids 1-day and 15-day packages for subscriber garages', () => {
    const subscriberGarage = { id: 'g1', name: 'Subscriber Garage', hasMonthlySubscribers: true };
    
    const dailyPkg = samplePackages[0];
    const biweeklyPkg = samplePackages[1];
    const monthlyPkg = samplePackages[2];

    const dailyResult = getPackageRechargeRestrictions(subscriberGarage, dailyPkg);
    expect(dailyResult.isAllowed).toBe(false);
    expect(dailyResult.reason).toContain('30 يوم');

    const biweeklyResult = getPackageRechargeRestrictions(subscriberGarage, biweeklyPkg);
    expect(biweeklyResult.isAllowed).toBe(false);
    expect(biweeklyResult.reason).toContain('30 يوم');

    const monthlyResult = getPackageRechargeRestrictions(subscriberGarage, monthlyPkg);
    expect(monthlyResult.isAllowed).toBe(true);
  });
});
