import crypto from 'node:crypto';
import { type Firestore, type UpdateData } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  GarageProfileStateSchema,
  GarageProfileUpdateInputSchema,
  GarageProfileUpdateResultSchema,
  type GarageProfileMutableField,
  type GarageProfileState,
  type GarageProfileUpdateInput,
  type GarageProfileUpdateResult
} from '../contracts/garageProfile.js';
import { idempotencyFingerprint } from '../domain/operations.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const StoredResultSchema = z.object({
  fingerprint: z.string().length(64),
  responseJson: z.string().max(30000),
  createdAt: z.unknown()
}).strict();

type FirestoreTimestampLike = Readonly<{ toDate(): Date }>;
type LegacyGarage = Readonly<Record<string, unknown>>;

function operationKey(actorUid: string, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`garage.profile.update:${actorUid}:${idempotencyKey}`).digest('hex');
}

function asRecord(raw: unknown): LegacyGarage {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_GARAGE_DOCUMENT');
  return raw as LegacyGarage;
}

function isoDate(value: unknown): string {
  const date = value instanceof Date
    ? value
    : value !== null && typeof value === 'object' && 'toDate' in value && typeof (value as FirestoreTimestampLike).toDate === 'function'
      ? (value as FirestoreTimestampLike).toDate()
      : typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_UPDATEDAT');
  return date.toISOString();
}

function optionalValue(record: LegacyGarage, key: string): unknown {
  return record[key] === undefined ? undefined : record[key];
}

function mapGarage(id: string, raw: unknown): GarageProfileState {
  const value = asRecord(raw);
  const name = value.name ?? value.garageName;
  const dailyCapacity = value.dailyCapacity ?? value.capacity;
  return GarageProfileStateSchema.parse({
    id,
    name,
    ...(optionalValue(value, 'phone') !== undefined ? { phone: value.phone } : {}),
    ...(optionalValue(value, 'ownerName') !== undefined ? { ownerName: value.ownerName } : {}),
    ...(dailyCapacity !== undefined ? { dailyCapacity } : {}),
    ...(optionalValue(value, 'isMaintenanceMode') !== undefined ? { isMaintenanceMode: value.isMaintenanceMode } : {}),
    ...(optionalValue(value, 'maintenanceMessage') !== undefined ? { maintenanceMessage: value.maintenanceMessage } : {}),
    ...(optionalValue(value, 'warningDaysThreshold') !== undefined ? { warningDaysThreshold: value.warningDaysThreshold } : {}),
    ...(optionalValue(value, 'checkInSound') !== undefined ? { checkInSound: value.checkInSound } : {}),
    ...(optionalValue(value, 'checkOutSound') !== undefined ? { checkOutSound: value.checkOutSound } : {}),
    ...(optionalValue(value, 'shimmerColor') !== undefined ? { shimmerColor: value.shimmerColor } : {}),
    updatedAt: isoDate(value.updatedAt ?? value.createdAt)
  });
}

function storedResult(raw: unknown): GarageProfileUpdateResult {
  const stored = StoredResultSchema.parse(raw);
  return GarageProfileUpdateResultSchema.parse(JSON.parse(stored.responseJson));
}

export interface GarageProfileManagementRepository {
  update(input: GarageProfileUpdateInput): Promise<GarageProfileUpdateResult>;
}

export class FirestoreGarageManagementRepository implements GarageProfileManagementRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }

  async update(input: GarageProfileUpdateInput): Promise<GarageProfileUpdateResult> {
    const command = GarageProfileUpdateInputSchema.parse(input);
    const mutableInput = Object.fromEntries(
      Object.entries(command).filter(([key]) => !['garageId', 'actorUid', 'occurredAt', 'idempotencyKey'].includes(key))
    );
    const fingerprint = idempotencyFingerprint('garage.profile.update', {
      actorUid: command.actorUid,
      garageId: command.garageId,
      idempotencyKey: command.idempotencyKey,
      updates: mutableInput
    });
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, command.idempotencyKey));
      const garageRef = this.firestore.doc(`garages/${command.garageId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return storedResult(stored);
      }
      const garageSnapshot = await transaction.get(garageRef);
      this.costs.recordRead(garageSnapshot.exists ? 1 : 0);
      if (!garageSnapshot.exists) throw new Error('GARAGE_NOT_FOUND');
      const raw = asRecord(garageSnapshot.data());
      if (raw.isDeleting === true) throw new Error('GARAGE_DELETION_IN_PROGRESS');
      const existing = mapGarage(garageSnapshot.id, raw);
      const occurredAt = new Date(command.occurredAt);
      const updates: Record<string, unknown> = { updatedAt: occurredAt };
      for (const field of Object.keys(mutableInput) as GarageProfileMutableField[]) {
        updates[field] = mutableInput[field];
      }
      const merged = GarageProfileStateSchema.parse({ ...existing, ...mutableInput, updatedAt: occurredAt.toISOString() });
      const result = GarageProfileUpdateResultSchema.parse({ garage: merged });
      transaction.update(garageRef, updates as UpdateData<Readonly<Record<string, unknown>>>);
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'garage',
        aggregateId: command.garageId,
        eventType: 'garage_profile_updated',
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { fields: Object.keys(mutableInput) }
      });
      transaction.create(idempotencyRef, {
        fingerprint,
        responseJson: JSON.stringify(result),
        createdAt: occurredAt
      });
      this.costs.recordWrite(3);
      return result;
    });
  }
}
