import { z } from 'zod';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { PackageSchema, type Package } from '../contracts/entities.js';
import { CostCounter, type PackageCatalogRepository, type ReadCost } from './packageCatalog.js';

const LegacyPackageSchema = z.object({
  name: z.string().min(1).max(160),
  price: z.number().finite().nonnegative().optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  vehiclesCount: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().optional(),
  dailyCapacity: z.number().int().nonnegative().optional(),
  vehicleLimit: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
  active: z.boolean().optional()
}).passthrough().superRefine((value, context) => {
  if (value.price === undefined && value.priceMinor === undefined) {
    context.addIssue({ code: 'custom', path: ['price'], message: 'A package price is required' });
  }
  if (value.durationDays === undefined && value.vehiclesCount === undefined) {
    context.addIssue({ code: 'custom', path: ['durationDays'], message: 'A package duration is required' });
  }
});

type LegacyPackage = z.infer<typeof LegacyPackageSchema>;

const MAX_SCAN = 100;

function decimalToMinorUnits(value: number): number {
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || Math.abs((minor / 100) - value) > Number.EPSILON * Math.max(1, Math.abs(value))) {
    throw new Error('PACKAGE_PRICE_PRECISION_INVALID');
  }
  return minor;
}

export function mapLegacyPackage(id: string, raw: unknown): Package {
  const value: LegacyPackage = LegacyPackageSchema.parse(raw);
  const durationDays = value.durationDays ?? value.vehiclesCount;
  const priceMinor = value.priceMinor ?? decimalToMinorUnits(value.price as number);
  const vehicleLimit = value.vehicleLimit ?? value.dailyCapacity ?? 0;
  const active = value.active ?? value.isActive ?? true;
  return PackageSchema.parse({
    id,
    name: value.name,
    durationDays,
    vehicleLimit,
    priceMinor,
    active
  });
}

export class FirestorePackageCatalogRepository implements PackageCatalogRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async listActive(limit: number): Promise<ReadonlyArray<Package>> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCAN) throw new Error('Package limit must be between 1 and 100');
    const snapshot = await this.firestore.collection('packages')
      .orderBy(FieldPath.documentId())
      .limit(MAX_SCAN)
      .get();
    this.costs.recordRead(snapshot.size);
    return snapshot.docs
      .map((document) => mapLegacyPackage(document.id, document.data()))
      .filter((item) => item.active)
      .slice(0, limit);
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
