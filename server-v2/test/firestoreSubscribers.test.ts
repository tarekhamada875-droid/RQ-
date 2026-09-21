import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreSubscriberStateRepository, mapLegacySubscriber } from '../repositories/firestoreSubscribers.js';
import type { Firestore } from 'firebase-admin/firestore';

const projectId = 'rq-v2-subscribers-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore subscriber state repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('maps legacy subscriber fields into the strict v2 state contract', () => {
    expect(mapLegacySubscriber('subscriber-1', {
      garageId: 'garage-1',
      plateNumber: 'ABC 123',
      plateNumberRaw: 'ABC123',
      startDate: '2026-09-21',
      endDate: '2026-10-21',
      createdAt: '2026-09-20T08:00:00.000Z'
    })).toEqual({
      id: 'subscriber-1',
      garageId: 'garage-1',
      plate: 'ABC123',
      status: 'active',
      startAt: '2026-09-21T00:00:00.000Z',
      endAt: '2026-10-21T00:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z'
    });
  });

  it('accepts explicit status and Firestore timestamp values', () => {
    const timestamp = { toDate: () => new Date('2026-09-21T12:30:00.000Z') };
    expect(mapLegacySubscriber('subscriber-2', {
      garageId: 'garage-1',
      plateNumberRaw: 'XYZ789',
      status: 'suspended',
      startAt: timestamp,
      endAt: timestamp,
      updatedAt: timestamp
    }).status).toBe('suspended');
  });

  it('rejects malformed or incomplete subscriber documents', () => {
    expect(() => mapLegacySubscriber('bad', { garageId: 'garage-1', status: 'active' })).toThrow();
    expect(() => mapLegacySubscriber('bad', {
      garageId: 'garage-1',
      plateNumberRaw: 'ABC123',
      startDate: 'not-a-date',
      endDate: '2026-10-21',
      createdAt: '2026-09-20T08:00:00.000Z'
    })).toThrow('INVALID_STARTAT');
  });

  it('reads bounded active subscribers in deterministic creation order', async () => {
    const collection = firestore.collection('garages/garage-1/subscribers');
    await collection.doc('older').set({ plateNumberRaw: 'OLD123', startDate: '2026-09-01', endDate: '2026-10-01', createdAt: '2026-09-20T08:00:00.000Z' });
    await collection.doc('newer').set({ plateNumberRaw: 'NEW123', startDate: '2026-09-02', endDate: '2026-10-02', createdAt: '2026-09-21T08:00:00.000Z' });
    await collection.doc('suspended').set({ plateNumberRaw: 'SUS123', status: 'suspended', startDate: '2026-09-03', endDate: '2026-10-03', createdAt: '2026-09-22T08:00:00.000Z' });

    const repository = new FirestoreSubscriberStateRepository(firestore);
    await expect(repository.listActive('garage-1', 2)).resolves.toEqual([
      { id: 'newer', garageId: 'garage-1', plate: 'NEW123', status: 'active', startAt: '2026-09-02T00:00:00.000Z', endAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-09-21T08:00:00.000Z' },
      { id: 'older', garageId: 'garage-1', plate: 'OLD123', status: 'active', startAt: '2026-09-01T00:00:00.000Z', endAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-09-20T08:00:00.000Z' }
    ]);
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 3, writes: 0, deletes: 0, transactionAttempts: 0 });
  });

  it('rejects invalid garage IDs and limits before issuing a read', async () => {
    const repository = new FirestoreSubscriberStateRepository(firestore);
    await expect(repository.listActive('', 1)).rejects.toThrow('Garage ID is required');
    await expect(repository.listActive('garage-1', 0)).rejects.toThrow('Subscriber limit must be between 1 and 50');
    await expect(repository.listActive('garage-1', 51)).rejects.toThrow('Subscriber limit must be between 1 and 50');
    expect(repository.getCostSnapshot().reads).toBe(0);
  });
});
