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
  it('accepts a non-expiring credit bundle', () => {
    expect(validatePackageCatalogRecord({ name: 'Starter credits', price: 300, creditQuantity: 400 }, 'credit-400'))
      .toEqual({
        id: 'credit-400',
        name: 'Starter credits',
        catalogType: 'credit_bundle',
        creditQuantity: 400,
        durationDays: 0,
        basePrice: 300,
        discountAmount: 0,
        finalPrice: 300,
        dailyCapacity: 0,
        isUnlimited: false,
      });
  });

  it('rejects credit-bundle discounts and invalid quantities', () => {
    expect(() => validatePackageCatalogRecord({ name: 'Discounted credits', price: 300, creditQuantity: 400, discountType: 'percentage', discountValue: 10 }, 'credit-discount')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ name: 'Zero credits', price: 300, creditQuantity: 0 }, 'credit-zero')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ name: 'Fractional credits', price: 300, creditQuantity: 1.5 }, 'credit-fraction')).toThrow('INVALID_PACKAGE_CONFIGURATION');
  });

  it('accepts a seven-day legacy package during the pre-cutover period', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, name: 'Weekly 7', durationDays: 7 }, 'weekly-7'))
      .toMatchObject({ id: 'weekly-7', name: 'Weekly 7', catalogType: 'legacy_time', durationDays: 7 });
  });

  it('normalizes a valid discounted legacy package', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, discountType: 'percentage', discountValue: 10 }, 'pkg-1'))
      .toMatchObject({ id: 'pkg-1', catalogType: 'legacy_time', durationDays: 30, basePrice: 300, discountAmount: 30, finalPrice: 270, dailyCapacity: 30 });
  });

  it('accepts cent-level legacy prices and fixed discounts', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, price: '120.50', discountType: 'fixed', discountValue: '0.25' }, 'pkg-cents'))
      .toMatchObject({ basePrice: 120.5, discountAmount: 0.25, finalPrice: 120.25 });
    expect(validatePackageCatalogRecord({ ...basePackage, discountType: 'fixed', discountValue: '' }, 'pkg-empty-discount'))
      .toMatchObject({ discountAmount: 0, finalPrice: 300 });
  });

  it('rejects inactive or invalid legacy package data', () => {
    expect(() => validatePackageCatalogRecord({ ...basePackage, isActive: false }, 'pkg')).toThrow('PACKAGE_INACTIVE');
    expect(() => validatePackageCatalogRecord({ ...basePackage, discountType: 'percentage', discountValue: 101 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...basePackage, durationDays: 0 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
    expect(() => validatePackageCatalogRecord({ ...basePackage, dailyCapacity: 1001 }, 'pkg')).toThrow('INVALID_PACKAGE_CONFIGURATION');
  });

  it('accepts an explicit unlimited legacy package only with zero capacity', () => {
    expect(validatePackageCatalogRecord({ ...basePackage, name: 'Open capacity', dailyCapacity: 0 }, 'pkg'))
      .toMatchObject({ catalogType: 'legacy_time', dailyCapacity: 0, isUnlimited: true });
  });
});
