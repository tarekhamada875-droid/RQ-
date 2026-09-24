import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreSubscriberCommandRepository } from '../repositories/firestoreSubscriberCommands.js';

const projectId = 'rq-v2-subscriber-command-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

const input = {
  garageId: 'garage-1', plate: 'ABC123', plateRaw: 'abc-123',
  startAt: '2026-09-21T00:00:00.000Z', endAt: '2026-10-21T00:00:00.000Z',
  actorUid: 'staff-1', occurredAt: '2026-09-21T12:00:00.000Z', idempotencyKey: 'subscriber-0001'
};

const renewal = {
  garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw',
  startAt: '2026-10-21T00:00:00.000Z', endAt: '2026-11-21T00:00:00.000Z',
  actorUid: 'staff-1', occurredAt: '2026-10-21T12:00:00.000Z', idempotencyKey: 'renewal-0001'
};

describe('Firestore subscriber command repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('creates a legacy-compatible subscriber, audit event, and idempotency record atomically', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    const result = await repository.create(input);
    expect(result.subscriber).toMatchObject({ id: 'plate_YWJjLTEyMw', garageId: 'garage-1', plate: 'ABC123', status: 'active' });
    expect((await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get()).data()).toMatchObject({ plateNumber: 'ABC123', plateNumberRaw: 'abc-123', startDate: input.startAt, endDate: input.endAt, status: 'active' });
    expect((await firestore.collection('business_events').get()).size).toBe(1);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(1);
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 0, writes: 3, transactionAttempts: 1 });
  });

  it('replays the same idempotent create without another event', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    const first = await repository.create(input);
    await expect(repository.create(input)).resolves.toEqual(first);
    expect((await firestore.collection('business_events').get()).size).toBe(1);
  });

  it('rejects reuse of an idempotency key with a changed command', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    await expect(repository.create({ ...input, plate: 'XYZ789', plateRaw: 'xyz-789' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
  });

  it('rejects a duplicate plate even with a different idempotency key', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    await expect(repository.create({ ...input, idempotencyKey: 'subscriber-0002' })).rejects.toThrow('SUBSCRIBER_ALREADY_EXISTS');
  });

  it('allows only one of two concurrent creates for the same plate', async () => {
    const first = new FirestoreSubscriberCommandRepository(firestore);
    const second = new FirestoreSubscriberCommandRepository(firestore);
    const results = await Promise.allSettled([
      first.create(input),
      second.create({ ...input, idempotencyKey: 'subscriber-0002' })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await firestore.collection('business_events').get()).size).toBe(1);
  });

  it('renews a subscriber and updates legacy-compatible date fields atomically', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const result = await repository.renew(renewal);
    expect(result.subscriber).toMatchObject({ status: 'active', startAt: renewal.startAt, endAt: renewal.endAt });
    expect((await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get()).data()).toMatchObject({ startDate: renewal.startAt, endDate: renewal.endAt, startAt: renewal.startAt, endAt: renewal.endAt, status: 'active' });
    expect((await firestore.collection('business_events').get()).size).toBe(2);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(2);
  });

  it('rejects invalid date ranges, cancelled subscribers, and missing subscribers', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    await expect(repository.renew({ ...renewal, endAt: renewal.startAt })).rejects.toThrow('INVALID_DATE_RANGE');
    await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').update({ status: 'cancelled' });
    await expect(repository.renew({ ...renewal, idempotencyKey: 'renewal-0002' })).rejects.toThrow('SUBSCRIBER_CANCELLED');
    await expect(repository.renew({ ...renewal, subscriberId: 'plate_missing', idempotencyKey: 'renewal-0003' })).rejects.toThrow('SUBSCRIBER_NOT_FOUND');
  });

  it('replays renewal and rejects changed-payload idempotency reuse', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const first = await repository.renew(renewal);
    await expect(repository.renew(renewal)).resolves.toEqual(first);
    await expect(repository.renew({ ...renewal, endAt: '2026-12-21T00:00:00.000Z' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('serializes concurrent renewals with one stored replay result', { timeout: 15000 }, async () => {
    const first = new FirestoreSubscriberCommandRepository(firestore);
    await first.create(input);
    const [left, right] = await Promise.all([
      first.renew(renewal),
      new FirestoreSubscriberCommandRepository(firestore).renew(renewal)
    ]);
    expect(left).toEqual(right);
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('updates allowed legacy fields without changing immutable plate identity', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const result = await repository.update({
      garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw',
      startAt: '2026-09-25T00:00:00.000Z', endAt: '2026-10-25T00:00:00.000Z',
      ownerName: 'Updated Owner', phone: '+201000000000', notes: 'Updated notes',
      actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'update-0001'
    });
    expect(result.subscriber).toMatchObject({ id: 'plate_YWJjLTEyMw', plate: 'abc-123', startAt: '2026-09-25T00:00:00.000Z', endAt: '2026-10-25T00:00:00.000Z' });
    expect((await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get()).data()).toMatchObject({ plateNumber: 'ABC123', plateNumberRaw: 'abc-123', startDate: '2026-09-25T00:00:00.000Z', endDate: '2026-10-25T00:00:00.000Z', ownerName: 'Updated Owner', phone: '+201000000000', notes: 'Updated notes' });
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('supports partial updates while enforcing date ranges and missing subscribers', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    await expect(repository.update({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', endAt: '2026-09-20T00:00:00.000Z', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'update-0002' })).rejects.toThrow('INVALID_DATE_RANGE');
    await expect(repository.update({ garageId: 'garage-1', subscriberId: 'plate_missing', ownerName: 'Missing', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'update-0003' })).rejects.toThrow('SUBSCRIBER_NOT_FOUND');
  });

  it('replays updates and rejects changed-payload idempotency reuse', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const update = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', ownerName: 'Replay Owner', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'update-0004' };
    const first = await repository.update(update);
    await expect(repository.update(update)).resolves.toEqual(first);
    await expect(repository.update({ ...update, ownerName: 'Changed Owner' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('serializes concurrent updates with one stored replay result', { timeout: 15000 }, async () => {
    const first = new FirestoreSubscriberCommandRepository(firestore);
    await first.create(input);
    const update = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', ownerName: 'Concurrent Owner', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'update-0005' };
    const [left, right] = await Promise.all([
      first.update(update),
      new FirestoreSubscriberCommandRepository(firestore).update(update)
    ]);
    expect(left).toEqual(right);
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('suspends an active subscriber and records an audit event atomically', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const result = await repository.suspend({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'suspend-0001' });
    expect(result.subscriber).toMatchObject({ id: 'plate_YWJjLTEyMw', status: 'suspended' });
    expect((await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get()).data()).toMatchObject({ status: 'suspended' });
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('rejects missing and non-active subscribers', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'suspend-0002' };
    await repository.suspend(command);
    await expect(repository.suspend({ ...command, idempotencyKey: 'suspend-0003' })).rejects.toThrow('SUBSCRIBER_NOT_ACTIVE');
    await expect(repository.suspend({ ...command, subscriberId: 'plate_missing', idempotencyKey: 'suspend-0004' })).rejects.toThrow('SUBSCRIBER_NOT_FOUND');
  });

  it('replays suspend and rejects changed-payload idempotency reuse', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'suspend-0005' };
    const first = await repository.suspend(command);
    await expect(repository.suspend(command)).resolves.toEqual(first);
    await expect(repository.suspend({ ...command, occurredAt: '2026-09-22T12:01:00.000Z' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('serializes concurrent suspends with one stored replay result', { timeout: 15000 }, async () => {
    const first = new FirestoreSubscriberCommandRepository(firestore);
    await first.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'suspend-0006' };
    const [left, right] = await Promise.all([first.suspend(command), new FirestoreSubscriberCommandRepository(firestore).suspend(command)]);
    expect(left).toEqual(right);
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('cancels without deleting the subscriber document and records one event', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const result = await repository.cancel({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'cancel-0001' });
    expect(result.subscriber).toMatchObject({ id: 'plate_YWJjLTEyMw', status: 'cancelled' });
    expect((await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get()).data()).toMatchObject({ plateNumber: 'ABC123', plateNumberRaw: 'abc-123', status: 'cancelled' });
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('rejects missing and already-cancelled subscribers', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'cancel-0002' };
    await repository.cancel(command);
    await expect(repository.cancel({ ...command, idempotencyKey: 'cancel-0003' })).rejects.toThrow('SUBSCRIBER_ALREADY_CANCELLED');
    await expect(repository.cancel({ ...command, subscriberId: 'plate_missing', idempotencyKey: 'cancel-0004' })).rejects.toThrow('SUBSCRIBER_NOT_FOUND');
  });

  it('replays cancel and rejects changed-payload idempotency reuse', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'cancel-0005' };
    const first = await repository.cancel(command);
    await expect(repository.cancel(command)).resolves.toEqual(first);
    await expect(repository.cancel({ ...command, occurredAt: '2026-09-22T12:01:00.000Z' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('serializes concurrent cancels with one stored replay result', { timeout: 15000 }, async () => {
    const first = new FirestoreSubscriberCommandRepository(firestore);
    await first.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'cancel-0006' };
    const [left, right] = await Promise.all([first.cancel(command), new FirestoreSubscriberCommandRepository(firestore).cancel(command)]);
    expect(left).toEqual(right);
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('tombstones without physical deletion, preserves plate/date fields, and writes one audit event', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'admin-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'delete-0001' };
    const result = await repository.delete(command);
    expect(result.subscriber).toMatchObject({ id: command.subscriberId, garageId: command.garageId, plate: 'abc-123', status: 'deleted', startAt: input.startAt, endAt: input.endAt });
    const document = await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get();
    expect(document.exists).toBe(true);
    expect(document.data()).toMatchObject({ plateNumber: input.plate, plateNumberRaw: input.plateRaw, startDate: input.startAt, endDate: input.endAt, status: 'deleted' });
    expect((await firestore.collection('business_events').get()).size).toBe(2);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(2);
  });

  it('replays deletion exactly, rejects changed-key payloads, missing records, and already-deleted records', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'admin-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'delete-0002' };
    const first = await repository.delete(command);
    await expect(repository.delete(command)).resolves.toEqual(first);
    await expect(repository.delete({ ...command, occurredAt: '2026-09-22T12:01:00.000Z' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    await expect(repository.delete({ ...command, idempotencyKey: 'delete-0003' })).rejects.toThrow('SUBSCRIBER_ALREADY_DELETED');
    await expect(repository.delete({ ...command, subscriberId: 'plate_missing', idempotencyKey: 'delete-0004' })).rejects.toThrow('SUBSCRIBER_NOT_FOUND');
    expect((await firestore.collection('business_events').get()).size).toBe(2);
  });

  it('rejects a document whose stored garage scope does not match the command', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    await expect(repository.delete({ garageId: 'garage-2', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'admin-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'delete-0005' })).rejects.toThrow('SUBSCRIBER_NOT_FOUND');
    expect((await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get()).data()).toMatchObject({ status: 'active' });
  });

  it('rejects stored scope mismatches for renewal, update, suspension, and cancellation', async () => {
    const repository = new FirestoreSubscriberCommandRepository(firestore);
    await repository.create(input);
    await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').update({ garageId: 'garage-2' });
    await expect(repository.renew({ ...renewal, idempotencyKey: 'renew-scope-1' })).rejects.toThrow('GARAGE_SCOPE_MISMATCH');
    await expect(repository.update({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', ownerName: 'Nope', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'update-scope-1' })).rejects.toThrow('GARAGE_SCOPE_MISMATCH');
    await expect(repository.suspend({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'suspend-scope-1' })).rejects.toThrow('GARAGE_SCOPE_MISMATCH');
    await expect(repository.cancel({ garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'staff-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'cancel-scope-1' })).rejects.toThrow('GARAGE_SCOPE_MISMATCH');
  });

  it('serializes concurrent same-key deletion attempts to one result and one event', { timeout: 15000 }, async () => {
    const first = new FirestoreSubscriberCommandRepository(firestore);
    await first.create(input);
    const command = { garageId: 'garage-1', subscriberId: 'plate_YWJjLTEyMw', actorUid: 'admin-1', occurredAt: '2026-09-22T12:00:00.000Z', idempotencyKey: 'delete-0006' };
    const [left, right] = await Promise.all([first.delete(command), new FirestoreSubscriberCommandRepository(firestore).delete(command)]);
    expect(left).toEqual(right);
    expect((await firestore.collection('business_events').get()).size).toBe(2);
    expect((await firestore.doc('garages/garage-1/subscribers/plate_YWJjLTEyMw').get()).exists).toBe(true);
  });
});
