import { describe, it, expect } from 'vitest';
import { filterPackagesForGarage, getCleanPackageInfo } from '../constants/packages';
import { calculateFinalPrice } from '../utils';
import type { Garage, Package } from '../types';

describe('Smart Action Prompt Business Logic', () => {
  const mockPackages: Package[] = [
    {
      id: 'pkg_standard_30d',
      name: 'باقة 30 يوم (50 سيارة)',
      price: 150,
      vehiclesCount: 30,
      dailyCapacity: 50,
      isActive: true,
    },
    {
      id: 'pkg_pro_30d',
      name: 'باقة 30 يوم (100 سيارة)',
      price: 250,
      vehiclesCount: 30,
      dailyCapacity: 100,
      isActive: true,
    },
    {
      id: 'pkg_unlimited_30d',
      name: 'باقة 30 يوم (غير محدود)',
      price: 400,
      vehiclesCount: 30,
      dailyCapacity: 0,
      isActive: true,
    }
  ];

  it('correctly resolves package and determines insufficient balance for direct call prompt', () => {
    const garage: Partial<Garage> = {
      id: 'garage_1',
      name: 'جراج النور',
      balance: 50, // Insufficient for 150 EGP package
      activePackageName: 'باقة 30 يوم (50 سيارة)',
      hasMonthlySubscribers: false
    };

    const validPackages = filterPackagesForGarage(mockPackages, Boolean(garage.hasMonthlySubscribers));
    const target = validPackages.find(p => p.name === garage.activePackageName) || validPackages[0];
    const { finalPrice } = calculateFinalPrice(target, Boolean(garage.hasMonthlySubscribers), 0, 0);

    expect(target).toBeDefined();
    expect(finalPrice).toBe(150);
    expect(Number(garage.balance) >= finalPrice).toBe(false);
  });

  it('correctly resolves package and enables 1-click renewal when balance is sufficient', () => {
    const garage: Partial<Garage> = {
      id: 'garage_2',
      name: 'جراج الفردوس',
      balance: 200, // Sufficient for 150 EGP package
      activePackageName: 'باقة 30 يوم (50 سيارة)',
      hasMonthlySubscribers: false
    };

    const validPackages = filterPackagesForGarage(mockPackages, Boolean(garage.hasMonthlySubscribers));
    const target = validPackages.find(p => p.name === garage.activePackageName) || validPackages[0];
    const { finalPrice } = calculateFinalPrice(target, Boolean(garage.hasMonthlySubscribers), 0, 0);

    expect(target).toBeDefined();
    expect(finalPrice).toBe(150);
    expect(Number(garage.balance) >= finalPrice).toBe(true);
  });

  it('recommends upgrade package when daily limit is reached', () => {
    const currentDailyCapacity = 50;
    const validPackages = filterPackagesForGarage(mockPackages, false);

    const upgradePkg = validPackages.find(p => {
      const info = getCleanPackageInfo(p);
      return info.isUnlimited || info.dailyCapacity > currentDailyCapacity;
    });

    expect(upgradePkg).toBeDefined();
    expect(upgradePkg?.id).toBe('pkg_pro_30d');
  });

  it('formats clean phone digits for tel: links without dashes, spaces, or Arabic numerals', () => {
    const rawPhones = [
      '0101-234-5678',
      '010 1234 5678',
      '+201012345678',
      '٠١٠١٢٣٤٥٦٧٨' // Arabic numerals
    ];

    const cleanPhones = rawPhones.map(p => {
      // normalize Arabic digits then strip non-digits
      const normalized = p.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
      return normalized.replace(/\D/g, '');
    });

    expect(cleanPhones[0]).toBe('01012345678');
    expect(cleanPhones[1]).toBe('01012345678');
    expect(cleanPhones[2]).toBe('201012345678');
    expect(cleanPhones[3]).toBe('01012345678');
  });

  it('correctly determines whether user can afford monthly vs lower packages for contextual routing', () => {
    const mixedPackages: Package[] = [
      { id: 'daily_30', name: 'باقة 30 سيارة/يوم', price: 15, durationDays: 1, vehiclesCount: 1, dailyCapacity: 30, isActive: true },
      { id: 'biweekly_30', name: 'باقة 30 سيارة/15 يوم', price: 120, durationDays: 15, vehiclesCount: 15, dailyCapacity: 30, isActive: true },
      { id: 'monthly_30', name: 'باقة 30 سيارة/شهر', price: 200, durationDays: 30, vehiclesCount: 30, dailyCapacity: 30, isActive: true },
    ];

    // Scenario A: Balance 250 EGP (Can afford monthly) -> directs to 30 days
    const balanceA = 250;
    const canAffordAnyA = mixedPackages.some(p => balanceA >= p.price);
    const canAffordMonthA = mixedPackages.some(p => p.durationDays >= 30 && balanceA >= p.price);
    expect(canAffordAnyA).toBe(true);
    expect(canAffordMonthA).toBe(true);

    // Scenario B: Balance 50 EGP (Cannot afford monthly, but can afford daily) -> directs to lower duration
    const balanceB = 50;
    const canAffordAnyB = mixedPackages.some(p => balanceB >= p.price);
    const canAffordMonthB = mixedPackages.some(p => p.durationDays >= 30 && balanceB >= p.price);
    const affordableB = mixedPackages.filter(p => balanceB >= p.price);
    const highestAffordableB = [...affordableB].sort((a, b) => b.durationDays - a.durationDays)[0];
    expect(canAffordAnyB).toBe(true);
    expect(canAffordMonthB).toBe(false);
    expect(highestAffordableB.durationDays).toBe(1);

    // Scenario C: Balance 10 EGP (Cannot afford any package) -> requires transfer
    const balanceC = 10;
    const canAffordAnyC = mixedPackages.some(p => balanceC >= p.price);
    expect(canAffordAnyC).toBe(false);
  });
});
