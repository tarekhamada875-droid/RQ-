import { describe, expect, it } from 'vitest';
import { isCreditBundlePackage } from './packageCatalog';

const validBundle = {
  id: 'credit-400',
  name: '400 credits',
  price: 400,
  creditQuantity: 400,
  catalogType: 'credit_bundle' as const,
  isActive: true,
};

describe('credit-bundle package catalog guard', () => {
  it('accepts a canonical bundle with optional catalog metadata', () => {
    expect(isCreditBundlePackage(validBundle)).toBe(true);
    expect(isCreditBundlePackage({ ...validBundle, createdAt: new Date() })).toBe(true);
  });

  it('rejects non-credit package formats and credit records with legacy fields', () => {
    expect(isCreditBundlePackage({ id: 'month-30', name: 'Monthly', price: 300, durationDays: 30 })).toBe(false);
    expect(isCreditBundlePackage({ ...validBundle, durationDays: 30 })).toBe(false);
    expect(isCreditBundlePackage({ ...validBundle, vehiclesCount: 30 })).toBe(false);
    expect(isCreditBundlePackage({ ...validBundle, dailyCapacity: 50 })).toBe(false);
    expect(isCreditBundlePackage({ ...validBundle, discountValue: 10 })).toBe(false);
  });

  it('rejects mismatched, fractional, inactive, or malformed credit bundles', () => {
    expect(isCreditBundlePackage({ ...validBundle, price: 500 })).toBe(false);
    expect(isCreditBundlePackage({ ...validBundle, creditQuantity: 1.5, price: 1.5 })).toBe(false);
    expect(isCreditBundlePackage({ ...validBundle, isActive: false })).toBe(false);
    expect(isCreditBundlePackage({ ...validBundle, name: '  ' })).toBe(false);
    expect(isCreditBundlePackage(null)).toBe(false);
  });
});
