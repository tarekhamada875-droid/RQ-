import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreVehicleCheckOutRepository } from '../repositories/firestoreVehicleCheckOut.js';

const projectId = 'rq-v2-vehicle-checkout-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

async function seedVehicle(overrides: Record<string, unknown> = {}): Promise<void> {
  await firestore.doc('garages/garage-1').set({
    name: 'Main Garage', hourlyRate: 50, overnightRate: 300,
    totalRevenue: 100, todayRevenue: 100, totalVehiclesOut: 2, carsInside: 1,
    todayCount: 3, lastTransactionDate: '2026-09-21', ...overrides
  });
  await firestore.doc('garages/garage-1/vehicles/abc-123').set({
    plateNumber: 'ABC123', plateNumberRaw: 'abc-123', status: 'inside', type: 'hourly',
    isSubscriber: false, entryTime: '2026-09-21T10:00:00.000Z', updatedAt: '2026-09-21T10:00:00.000Z'
  });
}

const input = {
  garageId: 'garage-1', vehicleId: 'abc-123', actorUid: 'staff-1',
  occurredAt: '2026-09-21T12:00:00.000Z', idempotencyKey: 'checkout-0001'
};

describe('Firestore vehicle check-out repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('writes the priced exit and accounting counters atomically', async () => {
    await seedVehicle();
    const repository = new FirestoreVehicleCheckOutRepository(firestore);
    const result = await repository.checkOut(input);
    expect(result).toMatchObject({ garageId: 'garage-1', vehicleId: 'abc-123', cost: 100, currency: 'EGP' });
    expect((await firestore.doc('garages/garage-1/vehicles/abc-123').get()).data()).toMatchObject({ status: 'outside', totalCost: 100 });
    expect((await firestore.doc('garages/garage-1').get()).data()).toMatchObject({ totalRevenue: 200, todayRevenue: 200, totalVehiclesOut: 3, carsInside: 0, todayCount: 3 });
    expect((await firestore.doc('garages/garage-1/daily_stats/2026-09-21').get()).data()).toMatchObject({ count: 0, revenue: 100 });
    expect((await firestore.collection('activity_logs').get()).size).toBe(1);
    expect(repository.getCostSnapshot()).toMatchObject({ writes: 5, transactionAttempts: 1 });
  });

  it('returns the stored result on replay and rejects a changed payload', async () => {
    await seedVehicle();
    const repository = new FirestoreVehicleCheckOutRepository(firestore);
    const first = await repository.checkOut(input);
    await expect(repository.checkOut(input)).resolves.toEqual(first);
    await expect(repository.checkOut({ ...input, vehicleId: 'other-1' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('activity_logs').get()).size).toBe(1);
  });

  it('charges subscribers zero while still recording the exit', async () => {
    await seedVehicle();
    await firestore.doc('garages/garage-1/vehicles/abc-123').set({ isSubscriber: true }, { merge: true });
    const result = await new FirestoreVehicleCheckOutRepository(firestore).checkOut(input);
    expect(result.cost).toBe(0);
    expect((await firestore.doc('garages/garage-1').get()).data()).toMatchObject({ totalRevenue: 100, carsInside: 0 });
  });

  it('rejects an already outside vehicle without writing activity', async () => {
    await seedVehicle();
    await firestore.doc('garages/garage-1/vehicles/abc-123').set({ status: 'outside' }, { merge: true });
    await expect(new FirestoreVehicleCheckOutRepository(firestore).checkOut(input)).rejects.toThrow('VEHICLE_ALREADY_OUTSIDE');
    expect((await firestore.collection('activity_logs').get()).size).toBe(0);
  });

  it('allows only one of two concurrent exits for the same vehicle', async () => {
    await seedVehicle();
    const first = new FirestoreVehicleCheckOutRepository(firestore);
    const second = new FirestoreVehicleCheckOutRepository(firestore);
    const results = await Promise.allSettled([
      first.checkOut(input),
      second.checkOut({ ...input, idempotencyKey: 'checkout-0002' })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await firestore.collection('activity_logs').get()).size).toBe(1);
  });
});
