import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreGarageDeletionRepository } from '../repositories/firestoreGarageDeletion.js';

const projectId = 'rq-v2-garage-deletion-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;
const garage = { name: 'Main Garage', isLocked: false, isSuspended: false, isDeleting: false, dailyCapacity: 50, carsInside: 2, updatedAt: '2026-09-21T08:00:00.000Z' };
const input = { garageId: 'garage-1', actorUid: 'admin-1', occurredAt: '2026-09-21T12:00:00.000Z', idempotencyKey: 'delete-start-01' };

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore garage deletion jobs', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('starts, advances bounded work, repairs/resumes, and never deletes garage or children', async () => {
    await firestore.doc('garages/garage-1').set(garage);
    await firestore.doc('garages/garage-1/subscribers/subscriber-1').set({ ownerName: 'Owner' });
    await firestore.doc('garages/garage-1/vehicles/vehicle-1').set({ plate: 'ABC' });
    const repository = new FirestoreGarageDeletionRepository(firestore);
    const started = await repository.start(input);
    expect(started.job).toMatchObject({ garageId: 'garage-1', phase: 'queued', deletedCount: 0 });
    const storedGarage = await firestore.doc('garages/garage-1').get();
    expect(storedGarage.exists).toBe(true);
    expect(storedGarage.data()).toMatchObject({ name: 'Main Garage', isDeleting: true, carsInside: 2 });
    expect((await firestore.doc('garages/garage-1/subscribers/subscriber-1').get()).exists).toBe(true);
    expect((await firestore.doc('garages/garage-1/vehicles/vehicle-1').get()).exists).toBe(true);
    const page = await repository.advance({ ...input, jobId: started.job.id, idempotencyKey: 'delete-page-01', deletedCount: 100, nextCursor: 'eyJ2ZXJzaW9uIjoxLCJzb3J0VmFsdWUiOiJ4IiwiaWQiOiJ4In0' });
    expect(page.job).toMatchObject({ phase: 'deleting', deletedCount: 100 });
    const repaired = await repository.advance({ ...input, jobId: started.job.id, idempotencyKey: 'delete-page-02', deletedCount: 0, repairNeeded: true, error: 'repair me' });
    expect(repaired.job.phase).toBe('repair_needed');
    const resumed = await repository.resume({ ...input, jobId: started.job.id, idempotencyKey: 'delete-resume-01' });
    expect(resumed.job.phase).toBe('deleting');
    expect((await firestore.collection('business_events').get()).size).toBe(4);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(4);
  });

  it('replays/conflicts and serializes concurrent same-key starts', { timeout: 15000 }, async () => {
    await firestore.doc('garages/garage-1').set(garage);
    const first = new FirestoreGarageDeletionRepository(firestore);
    const second = new FirestoreGarageDeletionRepository(firestore);
    const [left, right] = await Promise.all([first.start(input), second.start(input)]);
    expect(left).toEqual(right);
    await expect(first.start(input)).resolves.toEqual(left);
    await expect(first.start({ ...input, garageId: 'garage-2' })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('garage_deletion_jobs').get()).size).toBe(1);
    expect((await firestore.collection('business_events').get()).size).toBe(1);
    expect((await firestore.collection('idempotency_records').get()).size).toBe(1);
  });

  it('rejects missing garage before writing a job or audit record', async () => {
    const repository = new FirestoreGarageDeletionRepository(firestore);
    await expect(repository.start(input)).rejects.toThrow('GARAGE_NOT_FOUND');
    expect((await firestore.collection('garage_deletion_jobs').get()).size).toBe(0);
    expect((await firestore.collection('business_events').get()).size).toBe(0);
  });
});
