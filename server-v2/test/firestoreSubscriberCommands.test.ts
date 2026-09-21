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
});
