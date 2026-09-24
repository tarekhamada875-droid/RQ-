import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { createV2Firebase } from '../infrastructure/firebaseAdmin.js';
import { parseEnvironment } from '../config/environment.js';
import { FirestoreProjectionRepairQueueRepository } from '../repositories/firestoreProjectionRepairQueue.js';

const projectId = 'rq-v2-repair-queue-emulator';
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
let firestore: Firestore;
const now = '2026-09-22T12:00:00.000Z';
const task = {
  taskId: 'repair-task-1', garageId: 'garage-1', dateKey: '2026-09-22', idempotencyKey: 'repair-queue-1',
  events: [{ id: 'entry-1', garageId: 'garage-1', dateKey: '2026-09-22', type: 'entry' as const, occurredAt: '2026-09-22T11:00:00.000Z' }]
};

async function clearEmulator(): Promise<void> {
  const response = await fetch(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Unable to clear Firestore emulator: ${response.status}`);
}

describe('Firestore projection repair queue', () => {
  beforeAll(() => {
    firestore = createV2Firebase(parseEnvironment({ NODE_ENV: 'test', FIREBASE_PROJECT_ID: projectId } as Record<string, string>)).firestore;
  });
  beforeEach(async () => clearEmulator());
  afterAll(async () => clearEmulator());

  it('enqueues idempotently and rejects changed payload reuse', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    const first = await repository.enqueue(task);
    const replay = await repository.enqueue(task);
    expect(replay).toEqual(first);
    await expect(repository.enqueue({ ...task, events: [] })).rejects.toThrow('IDEMPOTENCY_KEY_REUSE');
    expect((await firestore.collection('projection_repair_tasks').get()).size).toBe(1);
  });

  it('claims one task for one worker and requires the lease owner to complete it', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    await repository.enqueue(task);
    const claimed = await repository.claim({ limit: 10, workerId: 'worker-1', now });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ status: 'running', attempts: 1, workerId: 'worker-1' });
    await expect(repository.complete({ taskId: task.taskId, workerId: 'worker-2', now })).rejects.toThrow('REPAIR_TASK_LEASE_MISMATCH');
    await expect(repository.complete({ taskId: task.taskId, workerId: 'worker-1', now })).resolves.toMatchObject({ status: 'completed' });
    expect(await repository.claim({ limit: 10, workerId: 'worker-1', now })).toHaveLength(0);
  });

  it('requeues failed work with a bounded retry time and exhausts after five attempts', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    await repository.enqueue(task);
    await repository.claim({ limit: 1, workerId: 'worker-1', now });
    const retried = await repository.fail({ taskId: task.taskId, workerId: 'worker-1', now, errorCode: 'REPAIR_FAILED' });
    expect(retried).toMatchObject({ status: 'queued', attempts: 1, lastErrorCode: 'REPAIR_FAILED' });
    await firestore.doc(`projection_repair_tasks/${task.taskId}`).update({ status: 'running', attempts: 5, workerId: 'worker-1' });
    await expect(repository.fail({ taskId: task.taskId, workerId: 'worker-1', now, errorCode: 'REPAIR_FAILED' })).resolves.toMatchObject({ status: 'failed', attempts: 5 });
  });

  it('does not reclaim a failed task before its bounded retry time', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    await repository.enqueue(task);
    await repository.claim({ limit: 1, workerId: 'worker-1', now });
    const retried = await repository.fail({ taskId: task.taskId, workerId: 'worker-1', now, errorCode: 'REPAIR_FAILED' });
    expect(retried.nextAttemptAt).toBe('2026-09-22T12:00:02.000Z');
    expect(await repository.claim({ limit: 1, workerId: 'worker-2', now: '2026-09-22T12:00:01.000Z' })).toHaveLength(0);
    expect(await repository.claim({ limit: 1, workerId: 'worker-2', now: '2026-09-22T12:00:02.000Z' })).toHaveLength(1);
  });

  it('allows only one concurrent claimant to acquire a queued task', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    await repository.enqueue(task);
    const [left, right] = await Promise.all([
      repository.claim({ limit: 1, workerId: 'worker-left', now }),
      repository.claim({ limit: 1, workerId: 'worker-right', now })
    ]);
    expect(left.length + right.length).toBe(1);
  });

  it('rejects completion after the worker lease expires without changing queue state', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    await repository.enqueue(task);
    await repository.claim({ limit: 1, workerId: 'worker-1', now });
    const expiredNow = '2026-09-22T12:06:00.000Z';
    await expect(repository.complete({ taskId: task.taskId, workerId: 'worker-1', now: expiredNow })).rejects.toThrow('REPAIR_TASK_LEASE_EXPIRED');
    expect((await firestore.doc(`projection_repair_tasks/${task.taskId}`).get()).data()).toMatchObject({ status: 'running', workerId: 'worker-1' });
  });

  it('rejects failure after the worker lease expires without changing queue state', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    await repository.enqueue(task);
    await repository.claim({ limit: 1, workerId: 'worker-1', now });
    const expiredNow = '2026-09-22T12:06:00.000Z';
    await expect(repository.fail({ taskId: task.taskId, workerId: 'worker-1', now: expiredNow, errorCode: 'REPAIR_FAILED' })).rejects.toThrow('REPAIR_TASK_LEASE_EXPIRED');
    expect((await firestore.doc(`projection_repair_tasks/${task.taskId}`).get()).data()).toMatchObject({ status: 'running', workerId: 'worker-1' });
  });

  it('reclaims an expired running lease for another worker', async () => {
    const repository = new FirestoreProjectionRepairQueueRepository(firestore);
    await repository.enqueue(task);
    await repository.claim({ limit: 1, workerId: 'worker-1', now });
    const reclaimed = await repository.claim({ limit: 1, workerId: 'worker-2', now: '2026-09-22T12:06:00.000Z' });
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]).toMatchObject({ status: 'running', attempts: 2, workerId: 'worker-2' });
    await expect(repository.complete({ taskId: task.taskId, workerId: 'worker-1', now: '2026-09-22T12:06:00.000Z' })).rejects.toThrow('REPAIR_TASK_LEASE_MISMATCH');
    await expect(repository.complete({ taskId: task.taskId, workerId: 'worker-2', now: '2026-09-22T12:06:00.000Z' })).resolves.toMatchObject({ status: 'completed' });
  });
});
