import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreGarageStateRepository, mapLegacyGarage } from '../repositories/firestoreGarages.js';
import type { Firestore } from 'firebase-admin/firestore';

const projectId = 'rq-v2-garages-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore garage state repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('maps legacy garage fields into the strict v2 state contract', () => {
    expect(mapLegacyGarage('garage-1', {
      name: 'Main Garage',
      dailyCapacity: 50,
      carsInside: 3,
      isLocked: true,
      isSuspended: false,
      updatedAt: '2026-09-21T08:00:00.000Z'
    })).toEqual({
      id: 'garage-1',
      name: 'Main Garage',
      isLocked: true,
      isSuspended: false,
      capacity: 50,
      carsInside: 3,
      updatedAt: '2026-09-21T08:00:00.000Z'
    });
  });

  it('supports legacy aliases and safe defaults', () => {
    expect(mapLegacyGarage('garage-2', {
      name: 'Unlimited Garage',
      capacity: 0,
      carsInsideCount: 2,
      createdAt: '2026-09-20T08:00:00.000Z'
    })).toEqual({
      id: 'garage-2',
      name: 'Unlimited Garage',
      isLocked: false,
      isSuspended: false,
      capacity: 0,
      carsInside: 2,
      updatedAt: '2026-09-20T08:00:00.000Z'
    });
  });

  it('accepts Firestore timestamp values and rejects malformed documents', () => {
    const timestamp = { toDate: () => new Date('2026-09-21T12:30:00.000Z') };
    expect(mapLegacyGarage('garage-3', { name: 'Timestamp Garage', dailyCapacity: 100, createdAt: timestamp }).updatedAt)
      .toBe('2026-09-21T12:30:00.000Z');
    expect(() => mapLegacyGarage('bad', { name: 'Missing Capacity', createdAt: '2026-09-21T00:00:00.000Z' })).toThrow();
    expect(() => mapLegacyGarage('bad', { name: 'Invalid Date', dailyCapacity: 10, updatedAt: 'not-a-date' })).toThrow('INVALID_UPDATEDAT');
  });

  it('reads one current garage document by ID and records returned reads', async () => {
    await firestore.collection('garages').doc('garage-1').set({
      name: 'Main Garage',
      dailyCapacity: 75,
      carsInside: 4,
      createdAt: '2026-09-21T08:00:00.000Z'
    });
    const repository = new FirestoreGarageStateRepository(firestore);
    await expect(repository.getById('garage-1')).resolves.toEqual({
      id: 'garage-1',
      name: 'Main Garage',
      isLocked: false,
      isSuspended: false,
      capacity: 75,
      carsInside: 4,
      updatedAt: '2026-09-21T08:00:00.000Z'
    });
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 1, writes: 0, deletes: 0, transactionAttempts: 0 });
  });

  it('returns null for a missing garage and rejects invalid IDs before reading', async () => {
    const repository = new FirestoreGarageStateRepository(firestore);
    await expect(repository.getById('missing')).resolves.toBeNull();
    expect(repository.getCostSnapshot().reads).toBe(0);
    await expect(repository.getById('')).rejects.toThrow('Garage ID is required');
    await expect(repository.getById('x'.repeat(161))).rejects.toThrow('Garage ID is required');
    expect(repository.getCostSnapshot().reads).toBe(0);
  });
});
