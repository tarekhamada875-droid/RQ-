export type PackageCatalogType = 'credit_bundle';

export interface ValidatedPackage {
  id: string;
  name: string;
  catalogType: PackageCatalogType;
  creditQuantity: number;
  basePrice: number;
  finalPrice: number;
}

const MAX_CREDIT_QUANTITY = 1_000_000;
const ALLOWED_PACKAGE_FIELDS = new Set([
  'id',
  'name',
  'price',
  'catalogType',
  'creditQuantity',
  'isActive',
  'createdAt',
]);

export function validatePackageCatalogRecord(raw: Record<string, any>, id: string): ValidatedPackage {
  if (!raw || raw.isActive === false) throw new Error('PACKAGE_INACTIVE');
  if (raw.catalogType !== 'credit_bundle') throw new Error('PACKAGE_NOT_CREDIT_BUNDLE');
  if (Object.keys(raw).some((key) => !ALLOWED_PACKAGE_FIELDS.has(key))) {
    throw new Error('INVALID_PACKAGE_CONFIGURATION');
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const creditQuantity = raw.creditQuantity;
  const price = raw.price;
  if (
    !name || name.length > 100 ||
    !Number.isSafeInteger(creditQuantity) || creditQuantity < 1 || creditQuantity > MAX_CREDIT_QUANTITY ||
    !Number.isSafeInteger(price) || price !== creditQuantity ||
    (raw.isActive !== undefined && typeof raw.isActive !== 'boolean')
  ) {
    throw new Error('INVALID_PACKAGE_CONFIGURATION');
  }

  return {
    id,
    name,
    catalogType: 'credit_bundle',
    creditQuantity,
    basePrice: price,
    finalPrice: price,
  };
}
