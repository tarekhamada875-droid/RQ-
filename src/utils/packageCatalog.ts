import type { Package } from '../types';

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

export function isCreditBundlePackage(value: unknown): value is Package {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const pkg = value as Record<string, unknown>;
  const quantity = pkg.creditQuantity;

  return Object.keys(pkg).every((key) => ALLOWED_PACKAGE_FIELDS.has(key)) &&
    typeof pkg.id === 'string' &&
    typeof pkg.name === 'string' && pkg.name.trim().length > 0 && pkg.name.trim().length <= 100 &&
    pkg.catalogType === 'credit_bundle' &&
    typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= MAX_CREDIT_QUANTITY &&
    typeof pkg.price === 'number' && Number.isSafeInteger(pkg.price) && pkg.price === quantity &&
    (pkg.isActive === undefined || pkg.isActive === true);
}
