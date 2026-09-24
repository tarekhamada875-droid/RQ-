import crypto from 'node:crypto';
import { type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  SubscriberCreateInputSchema,
  SubscriberCreateResultSchema,
  SubscriberRenewInputSchema,
  SubscriberRenewResultSchema,
  SubscriberUpdateInputSchema,
  SubscriberUpdateResultSchema,
  SubscriberSuspendInputSchema,
  SubscriberSuspendResultSchema,
  SubscriberCancelInputSchema,
  SubscriberCancelResultSchema,
  SubscriberDeleteInputSchema,
  SubscriberDeleteResultSchema,
  type SubscriberCreateInput,
  type SubscriberCreateResult,
  type SubscriberRenewInput,
  type SubscriberRenewResult,
  type SubscriberUpdateInput,
  type SubscriberUpdateResult,
  type SubscriberSuspendInput,
  type SubscriberSuspendResult,
  type SubscriberCancelInput,
  type SubscriberCancelResult,
  type SubscriberDeleteInput,
  type SubscriberDeleteResult
} from '../contracts/subscriberCommands.js';
import { executeSubscriberCommand } from '../domain/subscriberOperations.js';
import { idempotencyFingerprint } from '../domain/operations.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';
import { mapLegacySubscriber } from './firestoreSubscribers.js';

const StoredResultSchema = z.object({
  fingerprint: z.string().length(64),
  responseJson: z.string().max(20000),
  createdAt: z.unknown()
}).strict();

type SubscriberOperationKind = 'create' | 'renew' | 'update' | 'suspend' | 'cancel' | 'delete';

type LegacySubscriberUpdate = {
  updatedAt: Date;
  startDate?: string;
  endDate?: string;
  startAt?: string;
  endAt?: string;
  ownerName?: string;
  phone?: string;
  notes?: string;
};

function operationKey(actorUid: string, operation: SubscriberOperationKind, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`${actorUid}:subscriber.${operation}:${idempotencyKey}`).digest('hex');
}

function assertStoredGarageScope(raw: unknown, garageId: string): void {
  const storedGarageId = (raw as { garageId?: unknown } | undefined)?.garageId;
  if (typeof storedGarageId === 'string' && storedGarageId !== garageId) throw new Error('GARAGE_SCOPE_MISMATCH');
}

function subscriberId(plateRaw: string): string {
  return `plate_${Buffer.from(plateRaw).toString('base64url')}`;
}

function parseStoredCreateResult(raw: unknown): SubscriberCreateResult {
  const stored = StoredResultSchema.parse(raw);
  return SubscriberCreateResultSchema.parse(JSON.parse(stored.responseJson));
}

function parseStoredRenewResult(raw: unknown): SubscriberRenewResult {
  const stored = StoredResultSchema.parse(raw);
  return SubscriberRenewResultSchema.parse(JSON.parse(stored.responseJson));
}

function parseStoredUpdateResult(raw: unknown): SubscriberUpdateResult {
  const stored = StoredResultSchema.parse(raw);
  return SubscriberUpdateResultSchema.parse(JSON.parse(stored.responseJson));
}

function parseStoredSuspendResult(raw: unknown): SubscriberSuspendResult {
  const stored = StoredResultSchema.parse(raw);
  return SubscriberSuspendResultSchema.parse(JSON.parse(stored.responseJson));
}

function parseStoredCancelResult(raw: unknown): SubscriberCancelResult {
  const stored = StoredResultSchema.parse(raw);
  return SubscriberCancelResultSchema.parse(JSON.parse(stored.responseJson));
}

function parseStoredDeleteResult(raw: unknown): SubscriberDeleteResult {
  const stored = StoredResultSchema.parse(raw);
  return SubscriberDeleteResultSchema.parse(JSON.parse(stored.responseJson));
}

export interface SubscriberCommandRepository {
  create(input: SubscriberCreateInput): Promise<SubscriberCreateResult>;
  renew(input: SubscriberRenewInput): Promise<SubscriberRenewResult>;
  update(input: SubscriberUpdateInput): Promise<SubscriberUpdateResult>;
  suspend(input: SubscriberSuspendInput): Promise<SubscriberSuspendResult>;
  cancel(input: SubscriberCancelInput): Promise<SubscriberCancelResult>;
  delete(input: SubscriberDeleteInput): Promise<SubscriberDeleteResult>;
}

export class FirestoreSubscriberCommandRepository implements SubscriberCommandRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async create(input: SubscriberCreateInput): Promise<SubscriberCreateResult> {
    const command = SubscriberCreateInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('subscriber.create', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'create', command.idempotencyKey));
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
        return parseStoredCreateResult(stored);
      }
      if (deterministicSnapshot.exists || !legacyMatches.empty) throw new Error('SUBSCRIBER_ALREADY_EXISTS');
      const decision = executeSubscriberCommand({
        operation: 'create',
        idempotencyKey: command.idempotencyKey,
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

  async renew(input: SubscriberRenewInput): Promise<SubscriberRenewResult> {
    const command = SubscriberRenewInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('subscriber.renew', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'renew', command.idempotencyKey));
      const subscriberRef = this.firestore.doc(`garages/${command.garageId}/subscribers/${command.subscriberId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredRenewResult(stored);
      }
      const subscriberSnapshot = await transaction.get(subscriberRef);
      this.costs.recordRead(subscriberSnapshot.exists ? 1 : 0);
      assertStoredGarageScope(subscriberSnapshot.data(), command.garageId);
      const existing = subscriberSnapshot.exists
        ? mapLegacySubscriber(command.subscriberId, { ...subscriberSnapshot.data(), garageId: command.garageId })
        : null;
      const decision = executeSubscriberCommand({
        operation: 'renew',
        idempotencyKey: command.idempotencyKey,
        existing,
        subscriberId: command.subscriberId,
        garageId: command.garageId,
        plate: existing?.plate ?? 'unknown',
        startAt: new Date(command.startAt),
        endAt: new Date(command.endAt),
        occurredAt: new Date(command.occurredAt)
      });
      const result = SubscriberRenewResultSchema.parse({ operationId: decision.operation.operationId, subscriber: decision.subscriber });
      const occurredAt = new Date(command.occurredAt);
      transaction.update(subscriberRef, {
        startDate: command.startAt,
        endDate: command.endAt,
        startAt: command.startAt,
        endAt: command.endAt,
        updatedAt: occurredAt,
        status: 'active'
      });
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'subscriber',
        aggregateId: command.subscriberId,
        eventType: 'subscriber_renewed',
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { startAt: command.startAt, endAt: command.endAt }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: occurredAt });
      this.costs.recordWrite(3);
      return result;
    });
  }

  async update(input: SubscriberUpdateInput): Promise<SubscriberUpdateResult> {
    const command = SubscriberUpdateInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('subscriber.update', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'update', command.idempotencyKey));
      const subscriberRef = this.firestore.doc(`garages/${command.garageId}/subscribers/${command.subscriberId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredUpdateResult(stored);
      }
      const subscriberSnapshot = await transaction.get(subscriberRef);
      this.costs.recordRead(subscriberSnapshot.exists ? 1 : 0);
      assertStoredGarageScope(subscriberSnapshot.data(), command.garageId);
      const existing = subscriberSnapshot.exists
        ? mapLegacySubscriber(command.subscriberId, { ...subscriberSnapshot.data(), garageId: command.garageId })
        : null;
      const decision = executeSubscriberCommand({
        operation: 'update',
        idempotencyKey: command.idempotencyKey,
        existing,
        subscriberId: command.subscriberId,
        garageId: command.garageId,
        plate: existing?.plate ?? 'unknown',
        ...(command.startAt ? { startAt: new Date(command.startAt) } : {}),
        ...(command.endAt ? { endAt: new Date(command.endAt) } : {}),
        occurredAt: new Date(command.occurredAt)
      });
      const result = SubscriberUpdateResultSchema.parse({ operationId: decision.operation.operationId, subscriber: decision.subscriber });
      const occurredAt = new Date(command.occurredAt);
      const updates: LegacySubscriberUpdate = { updatedAt: occurredAt };
      if (command.startAt) {
        updates.startDate = command.startAt;
        updates.startAt = command.startAt;
      }
      if (command.endAt) {
        updates.endDate = command.endAt;
        updates.endAt = command.endAt;
      }
      if (command.ownerName !== undefined) updates.ownerName = command.ownerName;
      if (command.phone !== undefined) updates.phone = command.phone;
      if (command.notes !== undefined) updates.notes = command.notes;
      transaction.update(subscriberRef, updates);
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'subscriber',
        aggregateId: command.subscriberId,
        eventType: 'subscriber_updated',
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { updates: Object.keys(updates).filter((key) => key !== 'updatedAt') }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: occurredAt });
      this.costs.recordWrite(3);
      return result;
    });
  }

  async suspend(input: SubscriberSuspendInput): Promise<SubscriberSuspendResult> {
    const command = SubscriberSuspendInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('subscriber.suspend', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'suspend', command.idempotencyKey));
      const subscriberRef = this.firestore.doc(`garages/${command.garageId}/subscribers/${command.subscriberId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredSuspendResult(stored);
      }
      const subscriberSnapshot = await transaction.get(subscriberRef);
      this.costs.recordRead(subscriberSnapshot.exists ? 1 : 0);
      assertStoredGarageScope(subscriberSnapshot.data(), command.garageId);
      const existing = subscriberSnapshot.exists
        ? mapLegacySubscriber(command.subscriberId, { ...subscriberSnapshot.data(), garageId: command.garageId })
        : null;
      const decision = executeSubscriberCommand({
        operation: 'suspend',
        idempotencyKey: command.idempotencyKey,
        existing,
        subscriberId: command.subscriberId,
        garageId: command.garageId,
        plate: existing?.plate ?? 'unknown',
        occurredAt: new Date(command.occurredAt)
      });
      const result = SubscriberSuspendResultSchema.parse({ operationId: decision.operation.operationId, subscriber: decision.subscriber });
      const occurredAt = new Date(command.occurredAt);
      transaction.update(subscriberRef, { status: 'suspended', updatedAt: occurredAt });
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'subscriber',
        aggregateId: command.subscriberId,
        eventType: 'subscriber_suspended',
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { status: 'suspended' }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: occurredAt });
      this.costs.recordWrite(3);
      return result;
    });
  }

  async cancel(input: SubscriberCancelInput): Promise<SubscriberCancelResult> {
    const command = SubscriberCancelInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('subscriber.cancel', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'cancel', command.idempotencyKey));
      const subscriberRef = this.firestore.doc(`garages/${command.garageId}/subscribers/${command.subscriberId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredCancelResult(stored);
      }
      const subscriberSnapshot = await transaction.get(subscriberRef);
      this.costs.recordRead(subscriberSnapshot.exists ? 1 : 0);
      assertStoredGarageScope(subscriberSnapshot.data(), command.garageId);
      const existing = subscriberSnapshot.exists
        ? mapLegacySubscriber(command.subscriberId, { ...subscriberSnapshot.data(), garageId: command.garageId })
        : null;
      const decision = executeSubscriberCommand({
        operation: 'cancel',
        idempotencyKey: command.idempotencyKey,
        existing,
        subscriberId: command.subscriberId,
        garageId: command.garageId,
        plate: existing?.plate ?? 'unknown',
        occurredAt: new Date(command.occurredAt)
      });
      const result = SubscriberCancelResultSchema.parse({ operationId: decision.operation.operationId, subscriber: decision.subscriber });
      const occurredAt = new Date(command.occurredAt);
      transaction.update(subscriberRef, { status: 'cancelled', updatedAt: occurredAt });
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'subscriber',
        aggregateId: command.subscriberId,
        eventType: 'subscriber_cancelled',
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { status: 'cancelled' }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: occurredAt });
      this.costs.recordWrite(3);
      return result;
    });
  }

  async delete(input: SubscriberDeleteInput): Promise<SubscriberDeleteResult> {
    const command = SubscriberDeleteInputSchema.parse(input);
    const fingerprint = idempotencyFingerprint('subscriber.delete', command);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'delete', command.idempotencyKey));
      const subscriberRef = this.firestore.doc(`garages/${command.garageId}/subscribers/${command.subscriberId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredDeleteResult(stored);
      }
      const subscriberSnapshot = await transaction.get(subscriberRef);
      this.costs.recordRead(subscriberSnapshot.exists ? 1 : 0);
      const rawGarageId = subscriberSnapshot.data()?.garageId;
      if (subscriberSnapshot.exists && typeof rawGarageId === 'string' && rawGarageId !== command.garageId) throw new Error('GARAGE_SCOPE_MISMATCH');
      const existing = subscriberSnapshot.exists
        ? mapLegacySubscriber(command.subscriberId, { ...subscriberSnapshot.data(), garageId: command.garageId })
        : null;
      const decision = executeSubscriberCommand({
        operation: 'delete',
        idempotencyKey: command.idempotencyKey,
        existing,
        subscriberId: command.subscriberId,
        garageId: command.garageId,
        plate: existing?.plate ?? 'unknown',
        occurredAt: new Date(command.occurredAt)
      });
      const result = SubscriberDeleteResultSchema.parse({ operationId: decision.operation.operationId, subscriber: decision.subscriber });
      const occurredAt = new Date(command.occurredAt);
      transaction.update(subscriberRef, { status: 'deleted', updatedAt: occurredAt });
      const eventRef = this.firestore.collection('business_events').doc();
      transaction.create(eventRef, {
        garageId: command.garageId,
        aggregateType: 'subscriber',
        aggregateId: command.subscriberId,
        eventType: 'subscriber_deleted',
        actorUid: command.actorUid,
        occurredAt,
        idempotencyKey: command.idempotencyKey,
        payload: { status: 'deleted' }
      });
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: occurredAt });
      this.costs.recordWrite(3);
      return result;
    });
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }
}
