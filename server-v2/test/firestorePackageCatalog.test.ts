import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestorePackageCatalogRepository, mapLegacyPackage } from '../repositories/firestorePackageCatalog.js';
import type { Firestore } from 'firebase-admin/firestore';

const projectId = 'rq-v2-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore package catalog repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => {
    await clearEmulator();
  });

  it('maps legacy package fields into the strict v2 contract', () => {
    expect(mapLegacyPackage('legacy-weekly', {
      name: 'Weekly', price: 125, vehiclesCount: 7, dailyCapacity: 100, isActive: true
    })).toEqual({ id: 'legacy-weekly', name: 'Weekly', durationDays: 7, vehicleLimit: 100, priceMinor: 12500, active: true });
  });

  it('rejects malformed package documents', () => {
    expect(() => mapLegacyPackage('bad', { name: 'Missing price', durationDays: 7 })).toThrow();
    expect(() => mapLegacyPackage('bad', { name: 'Bad duration', price: 10, durationDays: 0 })).toThrow();
  });

  it('reads a bounded deterministic active catalog and records returned reads', async () => {
    await firestore.collection('packages').doc('b').set({ name: 'Beta', price: 20, durationDays: 30, isActive: true });
    await firestore.collection('packages').doc('a').set({ name: 'Alpha', price: 10, vehiclesCount: 15, dailyCapacity: 50, isActive: true });
    await firestore.collection('packages').doc('inactive').set({ name: 'Inactive', price: 5, durationDays: 1, isActive: false });

    const repository = new FirestorePackageCatalogRepository(firestore);
    await expect(repository.listActive(2)).resolves.toEqual([
      { id: 'a', name: 'Alpha', durationDays: 15, vehicleLimit: 50, priceMinor: 1000, active: true },
      { id: 'b', name: 'Beta', durationDays: 30, vehicleLimit: 0, priceMinor: 2000, active: true }
    ]);
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 3, writes: 0, deletes: 0, transactionAttempts: 0 });
  });

  it('rejects invalid limits before issuing a Firestore read', async () => {
    const repository = new FirestorePackageCatalogRepository(firestore);
    await expect(repository.listActive(0)).rejects.toThrow('Package limit must be between 1 and 100');
    await expect(repository.listActive(101)).rejects.toThrow('Package limit must be between 1 and 100');
    expect(repository.getCostSnapshot().reads).toBe(0);
  });
});
