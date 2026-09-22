import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreGarageSummaryRepository } from '../repositories/firestoreGarageSummary.js';

const projectId = 'rq-v2-garage-summary-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore garage summary repository', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('aggregates bounded projection buckets and uses the authoritative garage count', async () => {
    await firestore.doc('garages/garage-1').set({ carsInside: 3 });
    await firestore.doc('garages/garage-1/projection_buckets/bucket-a').set({ dateId: '2026-09-22', entriesToday: 2, exitsToday: 1, grossRevenue: 10.5, refundTotal: 1, netRevenue: 9.5, updatedAt: '2026-09-22T10:00:00.000Z' });
    await firestore.doc('garages/garage-1/projection_buckets/bucket-b').set({ dateId: '2026-09-22', entriesToday: 1, exitsToday: 0, grossRevenue: 5, refundTotal: 0, netRevenue: 5, updatedAt: '2026-09-22T11:00:00.000Z' });
    const repository = new FirestoreGarageSummaryRepository(firestore);
    await expect(repository.getSummary('garage-1', '2026-09-22')).resolves.toMatchObject({
      garageId: 'garage-1', dateKey: '2026-09-22', activeVehicleCount: 3, entriesToday: 3, exitsToday: 1,
      grossRevenueMinor: 1550, refundTotalMinor: 100, netRevenueMinor: 1450, projectionVersion: 1,
      asOf: '2026-09-22T11:00:00.000Z'
    });
    expect(repository.getCostSnapshot()).toMatchObject({ reads: 5, writes: 0, deletes: 0, transactionAttempts: 0 });
  });

  it('falls back to a date-matching stored dashboard summary when no live buckets exist', async () => {
    await firestore.doc('garages/garage-1').set({ carsInside: 1 });
    await firestore.doc('garages/garage-1/dashboard_summary/current').set({ dateId: '2026-09-22', activeVehicleCount: 1, entriesToday: 4, exitsToday: 2, grossRevenue: 20, refundTotal: 2.5, netRevenue: 17.5, projectionVersion: 2, rebuiltAt: '2026-09-22T12:00:00.000Z' });
    const repository = new FirestoreGarageSummaryRepository(firestore);
    await expect(repository.getSummary('garage-1', '2026-09-22')).resolves.toMatchObject({ grossRevenueMinor: 2000, refundTotalMinor: 250, netRevenueMinor: 1750, projectionVersion: 2 });
    await expect(repository.getSummary('garage-1', '2026-09-23')).resolves.toBeNull();
  });

  it('returns null for a missing garage and rejects invalid keys before reading', async () => {
    const repository = new FirestoreGarageSummaryRepository(firestore);
    await expect(repository.getSummary('missing', '2026-09-22')).resolves.toBeNull();
    await expect(repository.getSummary('', '2026-09-22')).rejects.toThrow('Garage ID is required');
    await expect(repository.getSummary('garage-1', 'bad-date')).rejects.toThrow('Invalid summary date');
    expect(repository.getCostSnapshot().reads).toBe(1);
  });

  it('serializes concurrent reads deterministically without writes', async () => {
    await firestore.doc('garages/garage-1').set({ carsInside: 2 });
    await firestore.doc('garages/garage-1/projection_buckets/bucket-a').set({ dateId: '2026-09-22', entriesToday: 1, updatedAt: '2026-09-22T10:00:00.000Z' });
    const first = new FirestoreGarageSummaryRepository(firestore);
    const second = new FirestoreGarageSummaryRepository(firestore);
    const [left, right] = await Promise.all([first.getSummary('garage-1', '2026-09-22'), second.getSummary('garage-1', '2026-09-22')]);
    expect(left).toEqual(right);
    expect(left?.entriesToday).toBe(1);
  });
});
