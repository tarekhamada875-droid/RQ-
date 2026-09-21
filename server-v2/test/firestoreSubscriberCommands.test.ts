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
});
