import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { SubscriberStateSchema, type SubscriberState } from '../contracts/subscriber.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const MAX_SCAN = 50;

const LegacySubscriberSchema = z.object({
  garageId: z.string().min(1).max(160).optional(),
  plateNumber: z.string().min(2).max(64).optional(),
  plateNumberRaw: z.string().min(2).max(64).optional(),
  status: z.enum(['active', 'suspended', 'cancelled', 'deleted']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startAt: z.unknown().optional(),
  endAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
  createdAt: z.unknown().optional()
}).passthrough().superRefine((value, context) => {
  if (!value.plateNumberRaw && !value.plateNumber) {
    context.addIssue({ code: 'custom', path: ['plateNumber'], message: 'A subscriber plate is required' });
  }
  if (value.startDate === undefined && value.startAt === undefined) {
    context.addIssue({ code: 'custom', path: ['startDate'], message: 'A subscriber start date is required' });
  }
  if (value.endDate === undefined && value.endAt === undefined) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'A subscriber end date is required' });
  }
  if (value.updatedAt === undefined && value.createdAt === undefined) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'A subscriber update time is required' });
  }
});

type LegacySubscriber = z.infer<typeof LegacySubscriberSchema>;
type FirestoreTimestampLike = Readonly<{ toDate(): Date }>;

function isoDate(value: unknown, field: string): string {
  const date = value instanceof Date
    ? value
    : value !== null && typeof value === 'object' && 'toDate' in value && typeof (value as FirestoreTimestampLike).toDate === 'function'
      ? (value as FirestoreTimestampLike).toDate()
      : typeof value === 'string'
        ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value)
        : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error(`INVALID_${field.toUpperCase()}`);
  return date.toISOString();
}

export function mapLegacySubscriber(id: string, raw: unknown): SubscriberState {
  const value: LegacySubscriber = LegacySubscriberSchema.parse(raw);
  const startAt = value.startAt ?? value.startDate;
  const endAt = value.endAt ?? value.endDate;
  const updatedAt = value.updatedAt ?? value.createdAt ?? startAt;
  return SubscriberStateSchema.parse({
    id,
    garageId: value.garageId,
    plate: value.plateNumberRaw ?? value.plateNumber,
    status: value.status ?? 'active',
    startAt: isoDate(startAt, 'startAt'),
    endAt: isoDate(endAt, 'endAt'),
    updatedAt: isoDate(updatedAt, 'updatedAt')
  });
}

export interface SubscriberStateRepository {
  listActive(garageId: string, limit: number): Promise<ReadonlyArray<SubscriberState>>;
}

export class FirestoreSubscriberStateRepository implements SubscriberStateRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async listActive(garageId: string, limit: number): Promise<ReadonlyArray<SubscriberState>> {
    if (!garageId || garageId.length > 160) throw new Error('Garage ID is required');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SCAN) throw new Error('Subscriber limit must be between 1 and 50');

    const snapshot = await this.firestore.collection(`garages/${garageId}/subscribers`)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(MAX_SCAN)
      .get();
    this.costs.recordRead(snapshot.size);
    return snapshot.docs
      .map((document) => mapLegacySubscriber(document.id, { ...document.data(), garageId }))
      .filter((subscriber) => subscriber.status === 'active')
      .slice(0, limit);
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}

export { MAX_SCAN as MAX_SUBSCRIBER_SCAN };
