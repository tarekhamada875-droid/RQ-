import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { GarageSummarySchema, type GarageSummary } from '../contracts/summary.js';
import type { GarageSummaryRepository } from './garageSummary.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const LegacySummarySchema = z.object({
  dateId: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rebuiltAt: z.unknown().optional(),
  activeVehicleCount: z.number().finite().nonnegative().optional(),
  entriesToday: z.number().finite().nonnegative().optional(),
  exitsToday: z.number().finite().nonnegative().optional(),
  grossRevenue: z.number().finite().nonnegative().optional(),
  refundTotal: z.number().finite().nonnegative().optional(),
  netRevenue: z.number().finite().optional(),
  projectionVersion: z.number().int().positive().optional()
}).passthrough();

const LegacyBucketSchema = z.object({
  activeVehicleCount: z.number().finite().nonnegative().optional(),
  entriesToday: z.number().finite().nonnegative().optional(),
  exitsToday: z.number().finite().nonnegative().optional(),
  grossRevenue: z.number().finite().nonnegative().optional(),
  refundTotal: z.number().finite().nonnegative().optional(),
  netRevenue: z.number().finite().optional(),
  updatedAt: z.unknown().optional(),
  rebuiltAt: z.unknown().optional()
}).passthrough();

const LegacyGarageSchema = z.object({
  carsInside: z.number().finite().nonnegative().optional(),
  carsInsideCount: z.number().finite().nonnegative().optional()
}).passthrough();

type TimestampLike = Readonly<{ toDate(): Date }>;
const MAX_BUCKETS = 100;

function isoDate(value: unknown, field: string): string {
  const date = value instanceof Date
    ? value
    : value !== null && typeof value === 'object' && 'toDate' in value && typeof (value as TimestampLike).toDate === 'function'
      ? (value as TimestampLike).toDate()
      : typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error(`INVALID_${field.toUpperCase()}`);
  return date.toISOString();
}

function minorUnits(value: number | undefined, field: string): number {
  const amount = value ?? 0;
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(minor / 100 - amount) > Number.EPSILON * Math.max(1, Math.abs(amount))) {
    throw new Error(`INVALID_${field.toUpperCase()}_PRECISION`);
  }
  return minor;
}

function mapStoredSummary(garageId: string, dateKey: string, raw: unknown): GarageSummary | null {
  const value = LegacySummarySchema.parse(raw);
  if (value.dateId !== dateKey || value.rebuiltAt === undefined) return null;
  return GarageSummarySchema.parse({
    garageId,
    dateKey,
    activeVehicleCount: Math.round(value.activeVehicleCount ?? 0),
    entriesToday: Math.round(value.entriesToday ?? 0),
    exitsToday: Math.round(value.exitsToday ?? 0),
    grossRevenueMinor: minorUnits(value.grossRevenue, 'gross_revenue'),
    refundTotalMinor: minorUnits(value.refundTotal, 'refund_total'),
    netRevenueMinor: minorUnits(value.netRevenue, 'net_revenue'),
    projectionVersion: value.projectionVersion ?? 1,
    asOf: isoDate(value.rebuiltAt, 'rebuilt_at')
  });
}

function mapBuckets(garageId: string, dateKey: string, garageRaw: unknown, rawBuckets: ReadonlyArray<unknown>): GarageSummary {
  const garage = LegacyGarageSchema.parse(garageRaw);
  type BucketTotals = Readonly<{
    activeVehicleCount: number;
    entriesToday: number;
    exitsToday: number;
    grossRevenue: number;
    refundTotal: number;
    netRevenue: number;
    asOf: number;
  }>;
  const totals = rawBuckets.map((raw) => LegacyBucketSchema.parse(raw)).reduce<BucketTotals>((result, bucket) => {
    const timestamps = [bucket.updatedAt, bucket.rebuiltAt].filter((value): value is unknown => value !== undefined).map((value) => Date.parse(isoDate(value, 'bucket_time')));
    return {
      activeVehicleCount: result.activeVehicleCount + (bucket.activeVehicleCount ?? 0),
      entriesToday: result.entriesToday + (bucket.entriesToday ?? 0),
      exitsToday: result.exitsToday + (bucket.exitsToday ?? 0),
      grossRevenue: result.grossRevenue + (bucket.grossRevenue ?? 0),
      refundTotal: result.refundTotal + (bucket.refundTotal ?? 0),
      netRevenue: result.netRevenue + (bucket.netRevenue ?? 0),
      asOf: Math.max(result.asOf, ...timestamps)
    };
  }, { activeVehicleCount: 0, entriesToday: 0, exitsToday: 0, grossRevenue: 0, refundTotal: 0, netRevenue: 0, asOf: 0 });
  return GarageSummarySchema.parse({
    garageId,
    dateKey,
    activeVehicleCount: Math.round(garage.carsInside ?? garage.carsInsideCount ?? totals.activeVehicleCount),
    entriesToday: Math.round(totals.entriesToday),
    exitsToday: Math.round(totals.exitsToday),
    grossRevenueMinor: minorUnits(totals.grossRevenue, 'gross_revenue'),
    refundTotalMinor: minorUnits(totals.refundTotal, 'refund_total'),
    netRevenueMinor: minorUnits(totals.netRevenue, 'net_revenue'),
    projectionVersion: 1,
    asOf: totals.asOf > 0 ? new Date(totals.asOf).toISOString() : new Date(0).toISOString()
  });
}

export class FirestoreGarageSummaryRepository implements GarageSummaryRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async getSummary(garageId: string, dateKey: string): Promise<GarageSummary | null> {
    if (!garageId || garageId.length > 160) throw new Error('Garage ID is required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Invalid summary date');
    const garageRef = this.firestore.doc(`garages/${garageId}`);
    const bucketsQuery = this.firestore.collection(`garages/${garageId}/projection_buckets`)
      .where('dateId', '==', dateKey)
      .orderBy(FieldPath.documentId())
      .limit(MAX_BUCKETS);
    const summaryRef = this.firestore.doc(`garages/${garageId}/dashboard_summary/current`);
    const [garageSnapshot, bucketsSnapshot, summarySnapshot] = await Promise.all([garageRef.get(), bucketsQuery.get(), summaryRef.get()]);
    this.costs.recordRead((garageSnapshot.exists ? 1 : 0) + bucketsSnapshot.size + (summarySnapshot.exists ? 1 : 0));
    if (!garageSnapshot.exists) return null;
    if (bucketsSnapshot.size > 0) return mapBuckets(garageId, dateKey, garageSnapshot.data(), bucketsSnapshot.docs.map((document) => document.data()));
    return summarySnapshot.exists ? mapStoredSummary(garageId, dateKey, summarySnapshot.data()) : null;
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
