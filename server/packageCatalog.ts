export interface ValidatedPackage {
  id: string;
  name: string;
  durationDays: number;
  basePrice: number;
  discountAmount: number;
  finalPrice: number;
  dailyCapacity: number;
  isUnlimited: boolean;
}

export function validatePackageCatalogRecord(raw: Record<string, any>, id: string): ValidatedPackage {
  if (!raw || raw.isActive === false) throw new Error('PACKAGE_INACTIVE');

  const name = String(raw.name || raw.packageName || '').trim();
  const durationDays = Number(raw.durationDays ?? raw.vehiclesCount);
  const basePrice = Number(raw.price ?? raw.priceAmount);
  if (!name || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
    throw new Error('INVALID_PACKAGE_CONFIGURATION');
  }
  if (!Number.isFinite(basePrice) || basePrice < 0) throw new Error('INVALID_PACKAGE_CONFIGURATION');

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
    if (discountValue > basePrice) throw new Error('INVALID_PACKAGE_CONFIGURATION');
    discountAmount = discountValue;
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
    durationDays,
    basePrice,
    discountAmount,
    finalPrice: Math.max(0, basePrice - discountAmount),
    dailyCapacity,
    isUnlimited
  };
}
