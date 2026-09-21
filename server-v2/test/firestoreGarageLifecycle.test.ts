import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreGarageLifecycleRepository } from '../repositories/firestoreGarageLifecycle.js';
import type { GarageLifecycleCommandInput } from '../contracts/garageLifecycle.js';

const projectId = 'rq-v2-garage-lifecycle-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

const garage = {
  name: 'Main Garage',
  isLocked: false,
  isSuspended: false,
  isDeleting: false,
  dailyCapacity: 50,
  carsInside: 2,
  updatedAt: '2026-09-21T08:00:00.000Z'
};

const input: GarageLifecycleCommandInput = {
  garageId: 'garage-1',
  actorUid: 'admin-1',
  occurredAt: '2026-09-21T12:00:00.000Z',
  idempotencyKey: 'garage-lock-0001'
};

describe('Firestore garage lifecycle repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('applies all four transitions with narrow updates and one audit/idempotency pair', async () => {
    await firestore.doc('garages/garage-1').set(garage);
    const repository = new FirestoreGarageLifecycleRepository(firestore);
    const locked = await repository.lock(input);
    expect(locked.garage).toMatchObject({ id: 'garage-1', isLocked: true, isSuspended: false });
    const unlocked = await repository.unlock({ ...input, occurredAt: '2026-09-21T12:01:00.000Z', idempotencyKey: 'garage-unlock-0001' });
    expect(unlocked.garage.isLocked).toBe(false);
    const suspended = await repository.suspend({ ...input, occurredAt: '2026-09-21T12:02:00.000Z', idempotencyKey: 'garage-suspend-0001' });
    expect(suspended.garage.isSuspended).toBe(true);
    const active = await repository.unsuspend({ ...input, occurredAt: '2026-09-21T12:03:00.000Z', idempotencyKey: 'garage-unsuspend-0001' });
    expect(active.garage.isSuspended).toBe(false);
    const stored = (await firestore.doc('garages/garage-1').get()).data();
    expect(stored).toMatchObject({ name: 'Main Garage', dailyCapacity: 50, carsInside: 2, isLocked: false, isSuspended: false });
    expect(Object.keys(stored ?? {}).sort()).toEqual(['carsInside', 'dailyCapacity', 'isDeleting', 'isLocked', 'isSuspended', 'name', 'updatedAt'].sort());
    expect((await firestore.collection('business_events').get()).size).toBe(4);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(4);
  });

  it('rejects missing and deleting garages', async () => {
    const repository = new FirestoreGarageLifecycleRepository(firestore);
    await expect(repository.lock(input)).rejects.toThrow('GARAGE_NOT_FOUND');
    await firestore.doc('garages/garage-1').set({ ...garage, isDeleting: true });
    await expect(repository.lock({ ...input, idempotencyKey: 'garage-lock-0002' })).rejects.toThrow('GARAGE_DELETION_IN_PROGRESS');
    expect((await firestore.collection('business_events').get()).size).toBe(0);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(0);
  });

  it('replays the exact result and rejects changed command reuse', async () => {
    await firestore.doc('garages/garage-1').set(garage);
    const repository = new FirestoreGarageLifecycleRepository(firestore);
    const first = await repository.lock(input);
    await expect(repository.lock(input)).resolves.toEqual(first);
    await expect(repository.unlock({ ...input })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    await expect(repository.lock({ ...input, actorUid: 'admin-2' })).rejects.toThrow('GARAGE_ALREADY_LOCKED');
    expect((await firestore.collection('business_events').get()).size).toBe(1);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(1);
  });

  it('serializes concurrent same-key attempts to one result and one audit event', { timeout: 15000 }, async () => {
    await firestore.doc('garages/garage-1').set(garage);
    const first = new FirestoreGarageLifecycleRepository(firestore);
    const second = new FirestoreGarageLifecycleRepository(firestore);
    const [left, right] = await Promise.all([first.lock(input), second.lock(input)]);
    expect(left).toEqual(right);
    expect((await firestore.collection('business_events').get()).size).toBe(1);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(1);
    expect((await firestore.doc('garages/garage-1').get()).data()).toMatchObject({ isLocked: true });
  });
});
