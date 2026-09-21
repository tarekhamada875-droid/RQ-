import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreVehicleCheckInRepository } from '../repositories/firestoreVehicleCheckIn.js';

const projectId = 'rq-v2-vehicle-checkin-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

const baseInput = {
  garageId: 'garage-1', plate: 'ABC123', plateRaw: 'abc-123', type: 'hourly',
  occurredAt: '2026-09-21T10:00:00.000Z', actorUid: 'staff-1', idempotencyKey: 'checkin-0001'
};

async function seedGarage(dailyCapacity = 50): Promise<void> {
  await firestore.collection('garages').doc('garage-1').set({
    name: 'Main Garage', isLocked: false, isSuspended: false, isDeleting: false,
    balanceExpiry: '2026-09-22T00:00:00.000Z', dailyCapacity, carsInside: 0,
    todayCount: 0, todayRevenue: 125, lastTransactionDate: '2026-09-21'
  });
}

describe('Firestore vehicle check-in repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('writes vehicle, garage counters, daily stats, activity, and idempotency atomically', async () => {
    await seedGarage();
    const repository = new FirestoreVehicleCheckInRepository(firestore);
    const result = await repository.checkIn(baseInput);
    expect(result.vehicle.status).toBe('inside');
    expect(result.carsInside).toBe(1);
    expect((await firestore.doc('garages/garage-1/vehicles/abc-123').get()).data()).toMatchObject({ status: 'inside', plateNumberRaw: 'abc-123' });
    expect((await firestore.doc('garages/garage-1').get()).data()).toMatchObject({ carsInside: 1, todayCount: 1, todayRevenue: 125 });
    expect((await firestore.collection('activity_logs').get()).size).toBe(1);
    expect(repository.getCostSnapshot()).toMatchObject({ writes: 5, transactionAttempts: 1 });
  });

  it('returns the stored result on replay and rejects key reuse with a different fingerprint', async () => {
    await seedGarage();
    const repository = new FirestoreVehicleCheckInRepository(firestore);
    const first = await repository.checkIn(baseInput);
    await expect(repository.checkIn(baseInput)).resolves.toEqual(first);
    await expect(repository.checkIn({ ...baseInput, plate: 'XYZ999', plateRaw: 'xyz-999' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('activity_logs').get()).size).toBe(1);
  });

  it('rejects an active subscriber before writing vehicle state', async () => {
    await seedGarage();
    await firestore.collection('garages/garage-1/subscribers').doc('sub-1').set({ plateNumberRaw: 'abc-123', startDate: '2026-09-01', endDate: '2026-09-30' });
    const repository = new FirestoreVehicleCheckInRepository(firestore);
    await expect(repository.checkIn(baseInput)).rejects.toThrow('MONTHLY_SUBSCRIBER_NOT_CHECKED_IN');
    expect((await firestore.doc('garages/garage-1/vehicles/abc-123').get()).exists).toBe(false);
  });

  it('enforces finite capacity through the transaction boundary', async () => {
    await seedGarage(1);
    const repository = new FirestoreVehicleCheckInRepository(firestore);
    await repository.checkIn(baseInput);
    await expect(repository.checkIn({ ...baseInput, plate: 'XYZ999', plateRaw: 'xyz-999', idempotencyKey: 'checkin-0002' })).rejects.toThrow('CAPACITY_LIMIT_REACHED');
  });

  it('allows exactly one of two concurrent entries when capacity is one', async () => {
    await seedGarage(1);
    const first = new FirestoreVehicleCheckInRepository(firestore);
    const second = new FirestoreVehicleCheckInRepository(firestore);
    const results = await Promise.allSettled([
      first.checkIn(baseInput),
      second.checkIn({ ...baseInput, plate: 'XYZ999', plateRaw: 'xyz-999', idempotencyKey: 'checkin-0002' })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await firestore.doc('garages/garage-1').get()).data()?.carsInside).toBe(1);
  });
});
