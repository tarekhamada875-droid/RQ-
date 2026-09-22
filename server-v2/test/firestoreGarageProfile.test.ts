import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreGarageManagementRepository } from '../repositories/firestoreGarageProfile.js';

const projectId = 'rq-v2-garage-profile-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;
const garage = {
  name: 'Main Garage', phone: '+201000000000', ownerName: 'Owner', dailyCapacity: 50,
  isMaintenanceMode: false, maintenanceMessage: '', warningDaysThreshold: 3,
  checkInSound: 'chime', checkOutSound: 'bell', shimmerColor: '#10b981',
  isLocked: false, isSuspended: false, isDeleting: false, balanceMinor: 9000,
  packageId: 'package-1', status: 'active', updatedAt: '2026-09-21T08:00:00.000Z'
};
const input = { garageId: 'garage-1', actorUid: 'admin-1', occurredAt: '2026-09-22T12:00:00.000Z', name: 'Renamed Garage', idempotencyKey: 'profile-0001' };

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore garage profile management', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('updates only allowlisted profile fields and creates one event and idempotency record', async () => {
    await firestore.doc('garages/garage-1').set(garage);
    const result = await new FirestoreGarageManagementRepository(firestore).update(input);
    expect(result.garage).toMatchObject({ id: 'garage-1', name: 'Renamed Garage', dailyCapacity: 50 });
    const stored = (await firestore.doc('garages/garage-1').get()).data();
    expect(stored).toMatchObject({ name: 'Renamed Garage', balanceMinor: 9000, packageId: 'package-1', status: 'active', isLocked: false, isDeleting: false });
    expect((await firestore.collection('business_events').get()).size).toBe(1);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(1);
  });

  it('rejects missing and deleting garages without writes', async () => {
    const repository = new FirestoreGarageManagementRepository(firestore);
    await expect(repository.update(input)).rejects.toThrow('GARAGE_NOT_FOUND');
    await firestore.doc('garages/garage-1').set({ ...garage, isDeleting: true });
    await expect(repository.update({ ...input, idempotencyKey: 'profile-0002' })).rejects.toThrow('GARAGE_DELETION_IN_PROGRESS');
    expect((await firestore.collection('business_events').get()).size).toBe(0);
  });

  it('replays, rejects changed payloads, scopes keys by actor, and serializes concurrency', { timeout: 15000 }, async () => {
    await firestore.doc('garages/garage-1').set(garage);
    const first = new FirestoreGarageManagementRepository(firestore);
    const second = new FirestoreGarageManagementRepository(firestore);
    const [left, right] = await Promise.all([first.update(input), second.update(input)]);
    expect(left).toEqual(right);
    await expect(first.update(input)).resolves.toEqual(left);
    await expect(first.update({ ...input, name: 'Changed' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    await expect(first.update({ ...input, actorUid: 'admin-2', name: 'Other Actor' })).resolves.toMatchObject({ garage: { name: 'Other Actor' } });
    expect((await firestore.collection('business_events').get()).size).toBe(2);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(2);
  });

  it('rejects immutable financial, deletion, package, status, and lock fields at the strict boundary', async () => {
    await firestore.doc('garages/garage-1').set(garage);
    const repository = new FirestoreGarageManagementRepository(firestore);
    for (const field of ['balanceMinor', 'isDeleting', 'packageId', 'status', 'isLocked', 'isSuspended']) {
      await expect(repository.update({ ...input, idempotencyKey: `profile-${field}`, [field]: true } as never)).rejects.toThrow();
    }
    expect((await firestore.collection('business_events').get()).size).toBe(0);
  });
});
