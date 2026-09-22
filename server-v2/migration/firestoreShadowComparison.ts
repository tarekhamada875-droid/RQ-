import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { type ShadowComparisonProvider } from '../contracts/shadowComparison.js';
import { type GarageSummary } from '../contracts/summary.js';
import { type Package } from '../contracts/entities.js';
import type { V2Environment } from '../config/environment.js';
import type { GarageSummaryRepository } from '../repositories/garageSummary.js';
import type { PackageCatalogRepository } from '../repositories/packageCatalog.js';
import { runShadowComparison, type ShadowComparisonOutcome } from './shadowComparisonCoordinator.js';

const MAX_SCAN = 100;
const LegacyRecordSchema = z.record(z.string(), z.unknown());
const DateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type LegacyRecord = z.infer<typeof LegacyRecordSchema>;

type ShadowReadDependencies = Readonly<{
  readLegacyPackages: (limit: number) => Promise<ReadonlyArray<Package>>;
  readV2Packages: (limit: number) => Promise<ReadonlyArray<Package>>;
  readLegacySummary: (garageId: string, dateKey: string) => Promise<GarageSummary | null>;
  readV2Summary: (garageId: string, dateKey: string) => Promise<GarageSummary | null>;
}>;

type ShadowProviderOptions = Readonly<{
  dependencies: ShadowReadDependencies;
  previewEnabled: boolean;
  previewAuthEnabled: boolean;
  legacyFallbackAvailable?: boolean;
  dataVersion?: string | number;
}>;

function record(value: unknown, label: string): LegacyRecord {
  const parsed = LegacyRecordSchema.safeParse(value);
  if (!parsed.success) throw new Error(`${label}_NOT_OBJECT`);
  return parsed.data;
}

function numberValue(value: unknown, field: string, options: Readonly<{ integer?: boolean; min?: number }> = {}): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(number) || (options.integer && !Number.isInteger(number)) || (options.min !== undefined && number < options.min)) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
  return number;
}

function minorUnits(value: unknown, field: string, allowNegative = false): number {
  const amount = numberValue(value, field, allowNegative ? {} : { min: 0 });
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(minor / 100 - amount) > Number.EPSILON * Math.max(1, Math.abs(amount))) {
    throw new Error(`INVALID_${field.toUpperCase()}_PRECISION`);
  }
  return minor;
}

function legacyPackageToCanonical(id: string, raw: unknown): Package {
  const value = record(raw, 'PACKAGE');
  const name = String(value.name ?? value.packageName ?? '').trim();
  const durationDays = numberValue(value.durationDays ?? value.vehiclesCount, 'duration_days', { integer: true, min: 1 });
  const priceMinor = value.priceMinor === undefined ? minorUnits(value.price ?? value.priceAmount, 'price') : numberValue(value.priceMinor, 'price_minor', { integer: true, min: 0 });
  const vehicleLimit = numberValue(value.vehicleLimit ?? value.dailyCapacity ?? 0, 'vehicle_limit', { integer: true, min: 0 });
  const active = value.active === undefined ? value.isActive !== false : value.active === true;
  if (!name || name.length > 160) throw new Error('INVALID_PACKAGE_NAME');
  return { id, name, durationDays, vehicleLimit, priceMinor, active };
}

function toIsoDate(value: unknown, field: string): string {
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value !== null && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') date = value.toDate();
  else date = new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error(`INVALID_${field.toUpperCase()}`);
  return date.toISOString();
}

function canonicalSummary(garageId: string, dateKey: string, raw: unknown): GarageSummary | null {
  const value = record(raw, 'SUMMARY');
  if (value.dateId !== dateKey || value.rebuiltAt === undefined) return null;
  return {
    garageId,
    dateKey,
    activeVehicleCount: Math.round(numberValue(value.activeVehicleCount ?? 0, 'active_vehicle_count', { min: 0 })),
    entriesToday: Math.round(numberValue(value.entriesToday ?? 0, 'entries_today', { min: 0 })),
    exitsToday: Math.round(numberValue(value.exitsToday ?? 0, 'exits_today', { min: 0 })),
    grossRevenueMinor: minorUnits(value.grossRevenue ?? 0, 'gross_revenue'),
    refundTotalMinor: minorUnits(value.refundTotal ?? 0, 'refund_total'),
    netRevenueMinor: minorUnits(value.netRevenue ?? 0, 'net_revenue', true),
    projectionVersion: numberValue(value.projectionVersion ?? 1, 'projection_version', { integer: true, min: 1 }),
    asOf: toIsoDate(value.rebuiltAt, 'rebuilt_at')
  };
}

function canonicalBucketSummary(garageId: string, dateKey: string, garageRaw: unknown, bucketRaw: ReadonlyArray<unknown>): GarageSummary {
  const garage = record(garageRaw, 'GARAGE');
  const totals = bucketRaw.map((item) => record(item, 'BUCKET')).reduce<{
    activeVehicleCount: number; entriesToday: number; exitsToday: number; grossRevenue: number;
    refundTotal: number; netRevenue: number; asOf: number;
  }>((result, bucket) => ({
    activeVehicleCount: result.activeVehicleCount + numberValue(bucket.activeVehicleCount ?? 0, 'active_vehicle_count', { min: 0 }),
    entriesToday: result.entriesToday + numberValue(bucket.entriesToday ?? 0, 'entries_today', { min: 0 }),
    exitsToday: result.exitsToday + numberValue(bucket.exitsToday ?? 0, 'exits_today', { min: 0 }),
    grossRevenue: result.grossRevenue + numberValue(bucket.grossRevenue ?? 0, 'gross_revenue', { min: 0 }),
    refundTotal: result.refundTotal + numberValue(bucket.refundTotal ?? 0, 'refund_total', { min: 0 }),
    netRevenue: result.netRevenue + numberValue(bucket.netRevenue ?? 0, 'net_revenue'),
    asOf: Math.max(result.asOf, ...[bucket.updatedAt, bucket.rebuiltAt].filter((value) => value !== undefined).map((value) => Date.parse(toIsoDate(value, 'bucket_time'))))
  }), { activeVehicleCount: 0, entriesToday: 0, exitsToday: 0, grossRevenue: 0, refundTotal: 0, netRevenue: 0, asOf: 0 });
  return {
    garageId,
    dateKey,
    activeVehicleCount: Math.round(numberValue(garage.carsInside ?? garage.carsInsideCount ?? totals.activeVehicleCount, 'active_vehicle_count', { min: 0 })),
    entriesToday: Math.round(totals.entriesToday),
    exitsToday: Math.round(totals.exitsToday),
    grossRevenueMinor: minorUnits(totals.grossRevenue, 'gross_revenue'),
    refundTotalMinor: minorUnits(totals.refundTotal, 'refund_total'),
    netRevenueMinor: minorUnits(totals.netRevenue, 'net_revenue', true),
    projectionVersion: 1,
    asOf: totals.asOf > 0 ? new Date(totals.asOf).toISOString() : new Date(0).toISOString()
  };
}

async function readLegacyPackages(firestore: Firestore, limit: number): Promise<ReadonlyArray<Package>> {
  const snapshot = await firestore.collection('packages').orderBy(FieldPath.documentId()).limit(MAX_SCAN).get();
  return snapshot.docs.map((document) => legacyPackageToCanonical(document.id, document.data())).filter((item) => item.active).slice(0, limit);
}

async function readLegacySummary(firestore: Firestore, garageId: string, dateKey: string): Promise<GarageSummary | null> {
  const garageRef = firestore.doc(`garages/${garageId}`);
  const bucketsQuery = firestore.collection(`garages/${garageId}/projection_buckets`).where('dateId', '==', dateKey).orderBy(FieldPath.documentId()).limit(MAX_SCAN);
  const summaryRef = firestore.doc(`garages/${garageId}/dashboard_summary/current`);
  const [garageSnapshot, bucketsSnapshot, summarySnapshot] = await Promise.all([garageRef.get(), bucketsQuery.get(), summaryRef.get()]);
  if (!garageSnapshot.exists) return null;
  if (bucketsSnapshot.size > 0) return canonicalBucketSummary(garageId, dateKey, garageSnapshot.data(), bucketsSnapshot.docs.map((document) => document.data()));
  return summarySnapshot.exists ? canonicalSummary(garageId, dateKey, summarySnapshot.data()) : null;
}

export function createShadowComparisonProvider(options: ShadowProviderOptions): ShadowComparisonProvider {
  return async (input): Promise<ShadowComparisonOutcome> => {
    const dataVersion = options.dataVersion ?? 'legacy-v2-shadow-1';
    if (input.endpoint === 'packages') {
      return runShadowComparison({
        comparison: { endpoint: '/api/v2/packages', requestId: input.requestId, dataVersion },
        readLegacy: () => options.dependencies.readLegacyPackages(100),
        readV2: () => options.dependencies.readV2Packages(100),
        previewEnabled: options.previewEnabled,
        previewAuthEnabled: options.previewAuthEnabled,
        ...(options.legacyFallbackAvailable === undefined ? {} : { legacyFallbackAvailable: options.legacyFallbackAvailable })
      });
    }
    const garageId = input.garageId;
    const dateKey = input.date;
    if (!garageId || !dateKey || !DateKeySchema.safeParse(dateKey).success) throw new Error('INVALID_SHADOW_SUMMARY_REQUEST');
    return runShadowComparison({
      comparison: { endpoint: '/api/v2/garages/:garageId/summary', garageId, garageScope: garageId, requestId: input.requestId, dataVersion },
      readLegacy: async () => {
        const summary = await options.dependencies.readLegacySummary(garageId, dateKey);
        return summary === null ? [] : [summary];
      },
      readV2: async () => {
        const summary = await options.dependencies.readV2Summary(garageId, dateKey);
        return summary === null ? [] : [summary];
      },
      previewEnabled: options.previewEnabled,
      previewAuthEnabled: options.previewAuthEnabled,
      ...(options.legacyFallbackAvailable === undefined ? {} : { legacyFallbackAvailable: options.legacyFallbackAvailable })
    });
  };
}

export function createFirestoreShadowComparisonProvider(input: Readonly<{
  firestore: Firestore;
  packageCatalog: PackageCatalogRepository;
  garageSummary: GarageSummaryRepository;
  environment: V2Environment;
}>): ShadowComparisonProvider {
  return createShadowComparisonProvider({
    dependencies: {
      readLegacyPackages: (limit) => readLegacyPackages(input.firestore, limit),
      readV2Packages: (limit) => input.packageCatalog.listActive(limit),
      readLegacySummary: (garageId, dateKey) => readLegacySummary(input.firestore, garageId, dateKey),
      readV2Summary: (garageId, dateKey) => input.garageSummary.getSummary(garageId, dateKey)
    },
    previewEnabled: input.environment.V2_PREVIEW_ENABLED,
    previewAuthEnabled: input.environment.V2_PREVIEW_AUTH_ENABLED,
    legacyFallbackAvailable: true
  });
}

export const shadowComparisonInternals = { canonicalSummary, canonicalBucketSummary, legacyPackageToCanonical };
