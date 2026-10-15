import { describe, expect, it } from 'vitest';
import { validatePackageCatalogRecord } from './packageCatalog';

const basePackage = {
  name: 'Monthly 30',
  isActive: true,
  durationDays: 30,
  price: 300,
  dailyCapacity: 30,
};

describe('server package catalog validation', () => {
  it('accepts a seven-day weekly package', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, name: 'Weekly 7', durationDays: 7 }, 'weekly-7'))
      .toMatchObject({ id: 'weekly-7', name: 'Weekly 7', durationDays: 7 });
  });

  it('normalizes a valid discounted package', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, discountType: 'percentage', discountValue: 10 }, 'pkg-1'))
      .toMatchObject({ id: 'pkg-1', durationDays: 30, basePrice: 300, discountAmount: 30, finalPrice: 270, dailyCapacity: 30, isUnlimited: false });
  });

  it('accepts cent-level prices and fixed discounts', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, price: '120.50', discountType: 'fixed', discountValue: '0.25' }, 'pkg-cents'))
      .toMatchObject({ basePrice: 120.5, discountAmount: 0.25, finalPrice: 120.25 });
    expect(validatePackageCatalogRecord({ ...basePackage, discountType: 'fixed', discountValue: '' }, 'pkg-empty-discount'))
      .toMatchObject({ discountAmount: 0, finalPrice: 300 });
  });

  it('rejects package prices and fixed discounts with invalid money precision', () => {
    expect(() => validatePackageCatalogRecord({ ...basePackage, price: 120.555 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...basePackage, discountType: 'fixed', discountValue: 0.255 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
  });

  it('rejects inactive, invalid discount, duration, and capacity data', () => {
    expect(() => validatePackageCatalogRecord({ ...basePackage, isActive: false }, 'pkg')).toThrow('PACKAGE_INACTIVE');
    expect(() => validatePackageCatalogRecord({ ...basePackage, discountType: 'percentage', discountValue: 101 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...basePackage, durationDays: 0 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...basePackage, dailyCapacity: 1001 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
  });

  it('accepts an explicit unlimited package only with zero capacity', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, name: 'Open capacity', dailyCapacity: 0 }, 'pkg'))
      .toMatchObject({ dailyCapacity: 0, isUnlimited: true });
  });
});
