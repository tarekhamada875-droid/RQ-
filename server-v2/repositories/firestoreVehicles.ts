import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { VehicleStateSchema, type VehicleState } from '../contracts/vehicle.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const MAX_SCAN = 200;

const LegacyVehicleSchema = z.object({
  garageId: z.string().min(1).max(160).optional(),
  plateNumber: z.string().min(2).max(64).optional(),
  plateNumberRaw: z.string().min(2).max(64).optional(),
  status: z.enum(['inside', 'outside']),
  entryTime: z.unknown().optional(),
  entryAt: z.unknown().optional(),
  updatedAt: z.unknown().optional()
}).passthrough().superRefine((value, context) => {
  if (!value.garageId) context.addIssue({ code: 'custom', path: ['garageId'], message: 'A garage ID is required' });
  if (!value.plateNumberRaw && !value.plateNumber) context.addIssue({ code: 'custom', path: ['plateNumber'], message: 'A vehicle plate is required' });
  if (value.entryTime === undefined && value.entryAt === undefined) context.addIssue({ code: 'custom', path: ['entryTime'], message: 'A vehicle entry time is required' });
});

type LegacyVehicle = z.infer<typeof LegacyVehicleSchema>;

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

export function mapLegacyVehicle(id: string, raw: unknown): VehicleState {
  const value: LegacyVehicle = LegacyVehicleSchema.parse(raw);
  const entryAt = value.entryAt ?? value.entryTime;
  const updatedAt = value.updatedAt ?? entryAt;
  return VehicleStateSchema.parse({
    id,
    garageId: value.garageId,
    plate: value.plateNumberRaw ?? value.plateNumber,
    status: value.status,
    ...(value.status === 'inside' ? { entryAt: isoDate(entryAt, 'entryAt') } : {}),
    updatedAt: isoDate(updatedAt, 'updatedAt')
  });
}

export interface VehicleStateRepository {
  listInside(garageId: string, limit: number): Promise<ReadonlyArray<VehicleState>>;
}

export class FirestoreVehicleStateRepository implements VehicleStateRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async listInside(garageId: string, limit: number): Promise<ReadonlyArray<VehicleState>> {
    if (!garageId || garageId.length > 160) throw new Error('Garage ID is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCAN) throw new Error('Vehicle limit must be between 1 and 200');

    const snapshot = await this.firestore.collection(`garages/${garageId}/vehicles`)
      .where('status', '==', 'inside')
      .orderBy('entryTime', 'desc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(limit)
      .get();
    this.costs.recordRead(snapshot.size);
    return snapshot.docs.map((document) => mapLegacyVehicle(document.id, { garageId, ...document.data() }));
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}

export { MAX_SCAN as MAX_VEHICLE_SCAN };
