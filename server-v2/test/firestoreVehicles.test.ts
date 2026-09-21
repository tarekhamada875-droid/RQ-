import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreVehicleStateRepository, mapLegacyVehicle } from '../repositories/firestoreVehicles.js';
import type { Firestore } from 'firebase-admin/firestore';

const projectId = 'rq-v2-vehicles-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore vehicle state repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('maps legacy vehicle fields into the strict v2 state contract', () => {
    expect(mapLegacyVehicle('vehicle-1', {
      garageId: 'garage-1',
      plateNumber: 'ABC 123',
      plateNumberRaw: 'ABC123',
      status: 'inside',
      entryTime: '2026-09-21T08:00:00.000Z'
    })).toEqual({
      id: 'vehicle-1',
      garageId: 'garage-1',
      plate: 'ABC123',
      status: 'inside',
      entryAt: '2026-09-21T08:00:00.000Z',
      updatedAt: '2026-09-21T08:00:00.000Z'
    });
  });

  it('rejects malformed or incomplete vehicle documents', () => {
    expect(() => mapLegacyVehicle('bad', { garageId: 'garage-1', status: 'inside' })).toThrow();
    expect(() => mapLegacyVehicle('bad', { garageId: 'garage-1', plateNumberRaw: 'ABC123', status: 'inside', entryTime: 'not-a-date' })).toThrow('INVALID_ENTRYAT');
  });

  it('reads bounded inside vehicles in deterministic entry order', async () => {
    const collection = firestore.collection('garages/garage-1/vehicles');
    await collection.doc('older').set({ plateNumberRaw: 'OLD123', status: 'inside', entryTime: '2026-09-21T08:00:00.000Z' });
    await collection.doc('newer').set({ plateNumberRaw: 'NEW123', status: 'inside', entryTime: '2026-09-21T09:00:00.000Z' });
    await collection.doc('outside').set({ plateNumberRaw: 'OUT123', status: 'outside', updatedAt: '2026-09-21T09:30:00.000Z' });

    const repository = new FirestoreVehicleStateRepository(firestore);
    await expect(repository.listInside('garage-1', 2)).resolves.toEqual([
      { id: 'newer', garageId: 'garage-1', plate: 'NEW123', status: 'inside', entryAt: '2026-09-21T09:00:00.000Z', updatedAt: '2026-09-21T09:00:00.000Z' },
      { id: 'older', garageId: 'garage-1', plate: 'OLD123', status: 'inside', entryAt: '2026-09-21T08:00:00.000Z', updatedAt: '2026-09-21T08:00:00.000Z' }
    ]);
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 2, writes: 0, deletes: 0, transactionAttempts: 0 });
  });

  it('rejects invalid garage IDs and limits before issuing a read', async () => {
    const repository = new FirestoreVehicleStateRepository(firestore);
    await expect(repository.listInside('', 1)).rejects.toThrow('Garage ID is required');
    await expect(repository.listInside('garage-1', 0)).rejects.toThrow('Vehicle limit must be between 1 and 200');
    await expect(repository.listInside('garage-1', 201)).rejects.toThrow('Vehicle limit must be between 1 and 200');
    expect(repository.getCostSnapshot().reads).toBe(0);
  });
});
