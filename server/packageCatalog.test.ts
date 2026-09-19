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
  it('normalizes a valid discounted package', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, discountType: 'percentage', discountValue: 10 }, 'pkg-1'))
      .toMatchObject({ id: 'pkg-1', durationDays: 30, basePrice: 300, discountAmount: 30, finalPrice: 270, dailyCapacity: 30, isUnlimited: false });
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
