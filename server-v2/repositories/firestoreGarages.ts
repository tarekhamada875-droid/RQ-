import { type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { GarageSchema, type Garage } from '../contracts/entities.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const LegacyGarageSchema = z.object({
  name: z.string().min(1).max(160),
  isLocked: z.boolean().optional(),
  isSuspended: z.boolean().optional(),
  dailyCapacity: z.number().int().nonnegative().optional(),
  capacity: z.number().int().nonnegative().optional(),
  carsInside: z.number().int().nonnegative().optional(),
  carsInsideCount: z.number().int().nonnegative().optional(),
  updatedAt: z.unknown().optional(),
  createdAt: z.unknown().optional()
}).passthrough().superRefine((value, context) => {
  if (value.dailyCapacity === undefined && value.capacity === undefined) {
    context.addIssue({ code: 'custom', path: ['dailyCapacity'], message: 'A garage capacity is required' });
  }
  if (value.updatedAt === undefined && value.createdAt === undefined) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'A garage update time is required' });
  }
});

type LegacyGarage = z.infer<typeof LegacyGarageSchema>;
type FirestoreTimestampLike = Readonly<{ toDate(): Date }>;

function isoDate(value: unknown, field: string): string {
  const date = value instanceof Date
    ? value
    : value !== null && typeof value === 'object' && 'toDate' in value && typeof (value as FirestoreTimestampLike).toDate === 'function'
      ? (value as FirestoreTimestampLike).toDate()
      : typeof value === 'string'
        ? new Date(value)
        : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error(`INVALID_${field.toUpperCase()}`);
  return date.toISOString();
}

export function mapLegacyGarage(id: string, raw: unknown): Garage {
  const value: LegacyGarage = LegacyGarageSchema.parse(raw);
  return GarageSchema.parse({
    id,
    name: value.name,
    isLocked: value.isLocked ?? false,
    isSuspended: value.isSuspended ?? false,
    capacity: value.dailyCapacity ?? value.capacity,
    carsInside: value.carsInside ?? value.carsInsideCount ?? 0,
    updatedAt: isoDate(value.updatedAt ?? value.createdAt, 'updatedAt')
  });
}

export interface GarageStateRepository {
  getById(garageId: string): Promise<Garage | null>;
}

export class FirestoreGarageStateRepository implements GarageStateRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async getById(garageId: string): Promise<Garage | null> {
    if (!garageId || garageId.length > 160) throw new Error('Garage ID is required');
    const snapshot = await this.firestore.collection('garages').doc(garageId).get();
    this.costs.recordRead(snapshot.exists ? 1 : 0);
    return snapshot.exists ? mapLegacyGarage(snapshot.id, snapshot.data()) : null;
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
