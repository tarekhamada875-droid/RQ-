import { parseMoneyAmount } from './money';

export type PackageCatalogType = 'legacy_time' | 'credit_bundle';

export interface ValidatedPackage {
  id: string;
  name: string;
  catalogType: PackageCatalogType;
  creditQuantity?: number;
  durationDays: number;
  basePrice: number;
  discountAmount: number;
  finalPrice: number;
  dailyCapacity: number;
  isUnlimited: boolean;
}

const MAX_CREDIT_QUANTITY = 1_000_000;

export function validatePackageCatalogRecord(raw: Record<string, any>, id: string): ValidatedPackage {
  if (!raw || raw.isActive === false) throw new Error('PACKAGE_INACTIVE');

  const name = String(raw.name || raw.packageName || '').trim();
  const basePrice = parseMoneyAmount(raw.price ?? raw.priceAmount);
  if (!name || basePrice === null || basePrice <= 0) throw new Error('INVALID_PACKAGE_CONFIGURATION');

  const hasCreditQuantity = raw.creditQuantity !== undefined && raw.creditQuantity !== null && String(raw.creditQuantity).trim() !== '';
  if (raw.catalogType !== undefined && raw.catalogType !== 'legacy_time' && raw.catalogType !== 'credit_bundle') {
    throw new Error('INVALID_PACKAGE_CONFIGURATION');
  }
  if (raw.catalogType === 'credit_bundle' && !hasCreditQuantity) throw new Error('INVALID_PACKAGE_CONFIGURATION');
  if (raw.catalogType === 'legacy_time' && hasCreditQuantity) throw new Error('INVALID_PACKAGE_CONFIGURATION');
  if (hasCreditQuantity) {
    const creditQuantity = Number(raw.creditQuantity);
    const discountValue = Number(raw.discountValue ?? 0);
    const hasDiscount = raw.discountType !== undefined && raw.discountType !== null && raw.discountType !== '' || discountValue !== 0;
    if (!Number.isSafeInteger(creditQuantity) || creditQuantity < 1 || creditQuantity > MAX_CREDIT_QUANTITY || hasDiscount || basePrice !== creditQuantity) {
      throw new Error('INVALID_PACKAGE_CONFIGURATION');
    }
    return {
      id,
      name,
      catalogType: 'credit_bundle',
      creditQuantity,
      durationDays: 0,
      basePrice,
      discountAmount: 0,
      finalPrice: basePrice,
      dailyCapacity: 0,
      isUnlimited: false,
    };
  }

  const durationDays = Number(raw.durationDays ?? raw.vehiclesCount);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
    throw new Error('INVALID_PACKAGE_CONFIGURATION');
  }

  const discountType = raw.discountType === undefined || raw.discountType === null || raw.discountType === ''
    ? null
    : raw.discountType;
  const discountValue = Number(raw.discountValue ?? 0);
  if (!Number.isFinite(discountValue) || discountValue < 0) throw new Error('INVALID_PACKAGE_CONFIGURATION');

  let discountAmount = 0;
  if (discountType === 'percentage') {
    if (discountValue > 100) throw new Error('INVALID_PACKAGE_CONFIGURATION');
    discountAmount = Math.round((basePrice * discountValue) / 100);
  } else if (discountType === 'fixed') {
    const fixedDiscount = raw.discountValue === '' ? 0 : parseMoneyAmount(raw.discountValue ?? 0);
    if (fixedDiscount === null || fixedDiscount > basePrice) throw new Error('INVALID_PACKAGE_CONFIGURATION');
    discountAmount = fixedDiscount;
  } else if (discountType !== null) {
    throw new Error('INVALID_PACKAGE_CONFIGURATION');
  }

  const hasCapacity = raw.dailyCapacity !== undefined && raw.dailyCapacity !== null && String(raw.dailyCapacity).trim() !== '';
  const configuredCapacity = hasCapacity ? Number(raw.dailyCapacity) : NaN;
  const nameSuggestsUnlimited = /مفتوح|غير محدود|غير محدودة|بدون حدود|سعة مفتوحة/i.test(name);
  const isUnlimited = hasCapacity
    ? Number.isFinite(configuredCapacity) && configuredCapacity === 0
    : raw.isUnlimited === true || nameSuggestsUnlimited;
  if (hasCapacity && (!Number.isFinite(configuredCapacity) || configuredCapacity < 0 || configuredCapacity > 1000)) {
    throw new Error('INVALID_PACKAGE_CONFIGURATION');
  }

  const dailyCapacity = isUnlimited ? 0 : (hasCapacity ? configuredCapacity : 40);
  return {
    id,
    name,
    catalogType: 'legacy_time',
    durationDays,
    basePrice,
    discountAmount,
    finalPrice: Math.max(0, basePrice - discountAmount),
    dailyCapacity,
    isUnlimited,
  };
}
