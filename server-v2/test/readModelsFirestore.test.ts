import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { parseEnvironment } from '../config/environment.js';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { FirestoreActivityRepository, FirestorePendingQueueRepository } from '../repositories/readModels.js';

const projectId = 'rq-v2-read-models-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore read-model repositories', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('pages pending requests by createdAt and document ID without offsets', async () => {
    const firstTime = new Date('2026-09-20T10:00:00.000Z');
    const secondTime = new Date('2026-09-20T10:01:00.000Z');
    await firestore.collection('recharge_requests').doc('b').set({ garageId: 'garage-1', status: 'pending', requestType: 'package', createdAt: firstTime });
    await firestore.collection('recharge_requests').doc('a').set({ garageId: 'garage-1', status: 'pending', requestType: 'package', createdAt: firstTime });
    await firestore.collection('recharge_requests').doc('later').set({ garageId: 'garage-1', status: 'pending', requestType: 'balance_topup', createdAt: secondTime });
    await firestore.collection('recharge_requests').doc('done').set({ garageId: 'garage-1', status: 'approved', requestType: 'package', createdAt: firstTime });

    const repository = new FirestorePendingQueueRepository(firestore);
    const first = await repository.listPending(2);
    expect(first.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(first.nextCursor).toBeDefined();
    expect(first.readCount).toBe(3);
    expect(first.projectionVersion).toBe(1);

    const second = await repository.listPending(2, first.nextCursor);
    expect(second.items.map((item) => item.id)).toEqual(['later']);
    expect(second.nextCursor).toBeUndefined();
    expect(repository.getCostSnapshot().reads).toBe(4);
  });

  it('pages recent activity newest-first and supports a garage scope', async () => {
    const old = new Date('2026-09-20T10:00:00.000Z');
    const newer = new Date('2026-09-20T10:01:00.000Z');
    await firestore.collection('activity_logs').doc('same-b').set({ garageId: 'garage-1', actionType: 'entry', timestamp: old });
    await firestore.collection('activity_logs').doc('same-a').set({ garageId: 'garage-1', actionType: 'exit', timestamp: old });
    await firestore.collection('activity_logs').doc('newer').set({ garageId: 'garage-1', actionType: 'recharge', timestamp: newer, status: 'OK' });
    await firestore.collection('activity_logs').doc('other-garage').set({ garageId: 'garage-2', actionType: 'entry', timestamp: newer });

    const repository = new FirestoreActivityRepository(firestore);
    const first = await repository.listRecent(2, undefined, 'garage-1');
    expect(first.items.map((item) => item.id)).toEqual(['newer', 'same-b']);
    expect(first.nextCursor).toBeDefined();
    expect(first.items[0]?.resultCode).toBe('OK');

    const second = await repository.listRecent(2, first.nextCursor, 'garage-1');
    expect(second.items.map((item) => item.id)).toEqual(['same-a']);
    expect(second.nextCursor).toBeUndefined();
  });

  it('rejects malformed legacy source documents at the repository boundary', async () => {
    await firestore.collection('recharge_requests').doc('bad-pending').set({ garageId: 'garage-1', status: 'pending', createdAt: 'not-a-timestamp' });
    const pending = new FirestorePendingQueueRepository(firestore);
    await expect(pending.listPending(1)).rejects.toThrow();

    await clearEmulator();
    await firestore.collection('activity_logs').doc('bad-activity').set({ garageId: 'garage-1', actionType: 'entry', timestamp: 'not-a-timestamp' });
    const activity = new FirestoreActivityRepository(firestore);
    await expect(activity.listRecent(1)).rejects.toThrow('READ_MODEL_TIMESTAMP_INVALID');
  });

  it('rejects invalid limits before issuing a Firestore read', async () => {
    const pending = new FirestorePendingQueueRepository(firestore);
    const activity = new FirestoreActivityRepository(firestore);
    await expect(pending.listPending(0)).rejects.toThrow('PAGE_SIZE_OUT_OF_RANGE');
    await expect(activity.listRecent(101)).rejects.toThrow('PAGE_SIZE_OUT_OF_RANGE');
    expect(pending.getCostSnapshot().reads).toBe(0);
    expect(activity.getCostSnapshot().reads).toBe(0);
  });
});
