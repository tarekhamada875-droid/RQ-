import crypto from 'node:crypto';
import { type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  GarageLifecycleInputSchema,
  GarageLifecycleResultSchema,
  GarageLifecycleStateSchema,
  type GarageLifecycleInput,
  type GarageLifecycleCommandInput,
  type GarageLifecycleResult,
  type GarageLifecycleState
} from '../contracts/garageLifecycle.js';
import { executeGarageCommand } from '../domain/garageLifecycle.js';
import { idempotencyFingerprint } from '../domain/operations.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const StoredResultSchema = z.object({
  fingerprint: z.string().length(64),
  responseJson: z.string().max(20000),
  createdAt: z.unknown()
}).strict();

const LegacyGarageLifecycleSchema = z.object({
  name: z.string().min(1).max(160),
  isLocked: z.boolean().optional(),
  isSuspended: z.boolean().optional(),
  isDeleting: z.boolean().optional(),
  updatedAt: z.unknown().optional(),
  createdAt: z.unknown().optional()
}).passthrough().superRefine((value, context) => {
  if (value.updatedAt === undefined && value.createdAt === undefined) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'A garage update time is required' });
  }
});

type FirestoreTimestampLike = Readonly<{ toDate(): Date }>;

type StoredGarage = GarageLifecycleState & Readonly<{ isDeleting: boolean }>;

function isoDate(value: unknown): string {
  const date = value instanceof Date
    ? value
    : value !== null && typeof value === 'object' && 'toDate' in value && typeof (value as FirestoreTimestampLike).toDate === 'function'
      ? (value as FirestoreTimestampLike).toDate()
      : typeof value === 'string'
        ? new Date(value)
        : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_UPDATEDAT');
  return date.toISOString();
}

function mapLifecycleGarage(id: string, raw: unknown): StoredGarage {
  const value = LegacyGarageLifecycleSchema.parse(raw);
  return {
    ...GarageLifecycleStateSchema.parse({
      id,
      name: value.name,
      isLocked: value.isLocked ?? false,
      isSuspended: value.isSuspended ?? false,
      updatedAt: isoDate(value.updatedAt ?? value.createdAt)
    }),
    isDeleting: value.isDeleting === true
  };
}

function operationKey(actorUid: string, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`garage.lifecycle:${actorUid}:${idempotencyKey}`).digest('hex');
}

function storedResult(raw: unknown): GarageLifecycleResult {
  const stored = StoredResultSchema.parse(raw);
  return GarageLifecycleResultSchema.parse(JSON.parse(stored.responseJson));
}

export interface GarageLifecycleRepository {
  lock(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult>;
  unlock(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult>;
  suspend(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult>;
  unsuspend(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult>;
}

export class FirestoreGarageLifecycleRepository implements GarageLifecycleRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  lock(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult> { return this.execute({ ...input, operation: 'lock' }); }
  unlock(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult> { return this.execute({ ...input, operation: 'unlock' }); }
  suspend(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult> { return this.execute({ ...input, operation: 'suspend' }); }
  unsuspend(input: GarageLifecycleCommandInput): Promise<GarageLifecycleResult> { return this.execute({ ...input, operation: 'unsuspend' }); }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }

  private async execute(input: GarageLifecycleInput): Promise<GarageLifecycleResult> {
    const command = GarageLifecycleInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint(`garage.${command.operation}`, {
      actorUid: command.actorUid,
      garageId: command.garageId,
      idempotencyKey: command.idempotencyKey
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
      const existing = mapLifecycleGarage(garageSnapshot.id, garageSnapshot.data());
      if (existing.isDeleting) throw new Error('GARAGE_DELETION_IN_PROGRESS');
      const occurredAt = new Date(command.occurredAt);
      const { isDeleting: _isDeleting, ...lifecycleState } = existing;
      const decision = executeGarageCommand({ operation: command.operation, existing: lifecycleState, garageId: command.garageId, occurredAt });
      const result = GarageLifecycleResultSchema.parse({ operationId: decision.operation.operationId, garage: decision.garage });
      transaction.update(garageRef, {
        ...(command.operation === 'lock' || command.operation === 'unlock' ? { isLocked: result.garage.isLocked } : { isSuspended: result.garage.isSuspended }),
        updatedAt: occurredAt
      });
      const eventRef = this.firestore.collection('business_events').doc();
      const eventType = command.operation === 'lock'
        ? 'garage_locked'
        : command.operation === 'unlock'
          ? 'garage_unlocked'
          : command.operation === 'suspend'
            ? 'garage_suspended'
            : 'garage_unsuspended';
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'garage',
        aggregateId: command.garageId,
        eventType,
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { operationId: result.operationId, allowedUpdates: decision.operation.allowedUpdates }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: occurredAt });
      this.costs.recordWrite(3);
      return result;
    });
  }
}
