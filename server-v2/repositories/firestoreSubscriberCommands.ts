import crypto from 'node:crypto';
import { type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { SubscriberCreateInputSchema, SubscriberCreateResultSchema, type SubscriberCreateInput, type SubscriberCreateResult } from '../contracts/subscriberCommands.js';
import { executeSubscriberCommand } from '../domain/subscriberOperations.js';
import { idempotencyFingerprint } from '../domain/operations.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const StoredResultSchema = z.object({
  fingerprint: z.string().length(64),
  responseJson: z.string().max(20000),
  createdAt: z.unknown()
}).strict();

function operationKey(input: SubscriberCreateInput): string {
  return crypto.createHash('sha256').update(`${input.actorUid}:subscriber.create:${input.idempotencyKey}`).digest('hex');
}

function subscriberId(plateRaw: string): string {
  return `plate_${Buffer.from(plateRaw).toString('base64url')}`;
}

function parseStoredResult(raw: unknown): SubscriberCreateResult {
  const stored = StoredResultSchema.parse(raw);
  return SubscriberCreateResultSchema.parse(JSON.parse(stored.responseJson));
}

export interface SubscriberCommandRepository {
  create(input: SubscriberCreateInput): Promise<SubscriberCreateResult>;
}

export class FirestoreSubscriberCommandRepository implements SubscriberCommandRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async create(input: SubscriberCreateInput): Promise<SubscriberCreateResult> {
    const command = SubscriberCreateInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('subscriber.create', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command));
      const subscribers = this.firestore.collection(`garages/${command.garageId}/subscribers`);
      const id = subscriberId(command.plateRaw);
      const subscriberRef = subscribers.doc(id);
      const [idempotencySnapshot, deterministicSnapshot, legacyMatches] = await Promise.all([
        transaction.get(idempotencyRef),
        transaction.get(subscriberRef),
        transaction.get(subscribers.where('plateNumberRaw', '==', command.plateRaw).limit(1))
      ]);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      this.costs.recordRead(deterministicSnapshot.exists ? 1 : 0);
      this.costs.recordRead(legacyMatches.size);

      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredResult(stored);
      }
      if (deterministicSnapshot.exists || !legacyMatches.empty) throw new Error('SUBSCRIBER_ALREADY_EXISTS');
      const decision = executeSubscriberCommand({
        operation: 'create',
        existing: null,
        subscriberId: id,
        garageId: command.garageId,
        plate: command.plate,
        startAt: new Date(command.startAt),
        endAt: new Date(command.endAt),
        occurredAt: new Date(command.occurredAt)
      });
      const result = SubscriberCreateResultSchema.parse({ operationId: decision.operation.operationId, subscriber: decision.subscriber });
      const occurredAt = new Date(command.occurredAt);
      transaction.create(subscriberRef, {
        id,
        garageId: command.garageId,
        plateNumber: command.plate,
        plateNumberRaw: command.plateRaw,
        startDate: command.startAt,
        endDate: command.endAt,
        status: 'active',
        createdAt: occurredAt,
        updatedAt: occurredAt
      });
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'subscriber',
        aggregateId: id,
        eventType: 'subscriber_created',
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { plateNumber: command.plate, plateNumberRaw: command.plateRaw, startAt: command.startAt, endAt: command.endAt }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: occurredAt });
      this.costs.recordWrite(3);
      return result;
    });
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
