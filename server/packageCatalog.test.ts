import { describe, expect, it } from 'vitest';
import { validatePackageCatalogRecord } from './packageCatalog';

const creditBundle = {
  name: 'Starter credits',
  price: 400,
  creditQuantity: 400,
  catalogType: 'credit_bundle',
};

describe('server package catalog validation', () => {
  it('accepts only a correctly priced, non-expiring credit bundle', () => {
    expect(validatePackageCatalogRecord(creditBundle, 'credit-400')).toEqual({
      id: 'credit-400',
      name: 'Starter credits',
      catalogType: 'credit_bundle',
      creditQuantity: 400,
      basePrice: 400,
      finalPrice: 400,
    });
  });

  it('rejects time-based and untyped package records', () => {
    expect(() => validatePackageCatalogRecord({
      name: 'Monthly 30', price: 300, catalogType: 'legacy_time', durationDays: 30, dailyCapacity: 50,
    }, 'legacy-30')).toThrow('PACKAGE_NOT_CREDIT_BUNDLE');
    expect(() => validatePackageCatalogRecord({
      name: 'Unspecified format', price: 400, creditQuantity: 400,
    }, 'untyped-400')).toThrow('PACKAGE_NOT_CREDIT_BUNDLE');
  });

  it('rejects credit bundles mixed with duration, capacity, discount, or unknown fields', () => {
    expect(() => validatePackageCatalogRecord({ ...creditBundle, durationDays: 30 }, 'mixed-duration')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, vehiclesCount: 30 }, 'mixed-vehicles')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, dailyCapacity: 50 }, 'mixed-capacity')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, discountValue: 10 }, 'discounted')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, unexpected: true }, 'unknown-field')).toThrow('INVALID_PACKAGE_CONFIGURATION');
  });

  it('rejects mismatched, fractional, zero, and out-of-range credits or prices', () => {
    expect(() => validatePackageCatalogRecord({ ...creditBundle, price: 600 }, 'price-mismatch')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, creditQuantity: 1.5, price: 1.5 }, 'fractional')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, creditQuantity: 0, price: 0 }, 'zero')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, creditQuantity: 1_000_001, price: 1_000_001 }, 'too-large')).toThrow('INVALID_PACKAGE_CONFIGURATION');
  });

  it('rejects inactive records and names outside the catalog limits', () => {
    expect(() => validatePackageCatalogRecord({ ...creditBundle, isActive: false }, 'inactive')).toThrow('PACKAGE_INACTIVE');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, name: ' ' }, 'blank-name')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...creditBundle, name: 'x'.repeat(101) }, 'long-name')).toThrow('INVALID_PACKAGE_CONFIGURATION');
  });

  it('accepts a stored credit bundle with only the approved catalog metadata', () => {
    expect(validatePackageCatalogRecord({
      id: 'credit-400',
      ...creditBundle,
      isActive: true,
      createdAt: new Date(),
    }, 'credit-400')).toMatchObject({
      id: 'credit-400',
      catalogType: 'credit_bundle',
      creditQuantity: 400,
      basePrice: 400,
      finalPrice: 400,
    });
  });
});
