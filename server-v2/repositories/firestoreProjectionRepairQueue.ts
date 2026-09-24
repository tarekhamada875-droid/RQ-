import crypto from 'node:crypto';
import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import { ProjectionRepairQueueEnqueueInputSchema, ProjectionRepairQueueTaskActionInputSchema, ProjectionRepairQueueClaimInputSchema, ProjectionRepairQueueTaskSchema, type ProjectionRepairQueueClaimInput, type ProjectionRepairQueueEnqueueInput, type ProjectionRepairQueueTask, type ProjectionRepairQueueTaskActionInput } from '../contracts/projectionRepairQueue.js';
import { idempotencyFingerprint } from '../domain/operations.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';
import { z } from 'zod';

const MAX_ATTEMPTS = 5;
const LEASE_MS = 5 * 60 * 1000;
const StoredEnqueueSchema = z.object({ fingerprint: z.string().length(64), responseJson: z.string().max(30000), createdAt: z.unknown() }).strict();

function taskRef(firestore: Firestore, taskId: string) {
  return firestore.collection('projection_repair_tasks').doc(taskId);
}

function operationKey(taskId: string): string {
  return crypto.createHash('sha256').update(`projection.repair.enqueue:${taskId}`).digest('hex');
}

function parseTask(id: string, raw: unknown): ProjectionRepairQueueTask {
  return ProjectionRepairQueueTaskSchema.parse({ ...(raw as Record<string, unknown>), taskId: id });
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_DATE');
  return date;
}

function parseStoredTask(raw: unknown): ProjectionRepairQueueTask {
  const stored = StoredEnqueueSchema.parse(raw);
  return ProjectionRepairQueueTaskSchema.parse(JSON.parse(stored.responseJson));
}

export interface ProjectionRepairQueueRepository {
  enqueue(input: ProjectionRepairQueueEnqueueInput): Promise<ProjectionRepairQueueTask>;
  claim(input: ProjectionRepairQueueClaimInput): Promise<ReadonlyArray<ProjectionRepairQueueTask>>;
  complete(input: ProjectionRepairQueueTaskActionInput): Promise<ProjectionRepairQueueTask>;
  fail(input: ProjectionRepairQueueTaskActionInput): Promise<ProjectionRepairQueueTask>;
  getCostSnapshot(): ReadCost;
}

export class FirestoreProjectionRepairQueueRepository implements ProjectionRepairQueueRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}

  async enqueue(rawInput: ProjectionRepairQueueEnqueueInput): Promise<ProjectionRepairQueueTask> {
    const input = ProjectionRepairQueueEnqueueInputSchema.parse(rawInput);
    const now = new Date().toISOString();
    const task = ProjectionRepairQueueTaskSchema.parse({ ...input, status: 'queued', attempts: 0, createdAt: now, updatedAt: now });
    const fingerprint = idempotencyFingerprint('projection.repair.enqueue', input);
    const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(input.taskId));
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const existingIdempotency = await transaction.get(idempotencyRef);
      this.costs.recordRead(existingIdempotency.exists ? 1 : 0);
      if (existingIdempotency.exists) {
        const stored = StoredEnqueueSchema.parse(existingIdempotency.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStoredTask(stored);
      }
      const existingTask = await transaction.get(taskRef(this.firestore, input.taskId));
      this.costs.recordRead(existingTask.exists ? 1 : 0);
      if (existingTask.exists) throw new Error('REPAIR_TASK_ALREADY_EXISTS');
      transaction.create(taskRef(this.firestore, input.taskId), task);
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(task), createdAt: now });
      this.costs.recordWrite(2);
      return task;
    });
  }

  async claim(rawInput: ProjectionRepairQueueClaimInput): Promise<ReadonlyArray<ProjectionRepairQueueTask>> {
    const input = ProjectionRepairQueueClaimInputSchema.parse(rawInput);
    const now = parseDate(input.now);
    const query = (status: 'queued' | 'running'): Query => this.firestore.collection('projection_repair_tasks')
      .where('status', '==', status)
      .orderBy('createdAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .limit(input.limit);
    const [queuedSnapshot, runningSnapshot] = await Promise.all([query('queued').get(), query('running').get()]);
    this.costs.recordRead(queuedSnapshot.size + runningSnapshot.size);
    const documents = [...queuedSnapshot.docs, ...runningSnapshot.docs]
      .sort((left, right) => String(left.data().createdAt).localeCompare(String(right.data().createdAt)) || left.id.localeCompare(right.id))
      .slice(0, input.limit);
    const claimed: ProjectionRepairQueueTask[] = [];
    for (const document of documents) {
      const ref = taskRef(this.firestore, document.id);
      this.costs.recordTransactionAttempt();
      const result = await this.firestore.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(ref);
        this.costs.recordRead(currentSnapshot.exists ? 1 : 0);
        if (!currentSnapshot.exists) return undefined;
        const current = parseTask(document.id, currentSnapshot.data());
        const queuedReady = current.status === 'queued' && (!current.nextAttemptAt || parseDate(current.nextAttemptAt).getTime() <= now.getTime());
        const expiredRunning = current.status === 'running' && Boolean(current.leaseUntil) && parseDate(current.leaseUntil as string).getTime() <= now.getTime();
        if (!queuedReady && !expiredRunning) return undefined;
        if (current.attempts >= MAX_ATTEMPTS) {
          transaction.update(ref, { status: 'failed', updatedAt: input.now, lastErrorCode: 'REPAIR_ATTEMPTS_EXHAUSTED' });
          this.costs.recordWrite();
          return undefined;
        }
        const next = ProjectionRepairQueueTaskSchema.parse({
          ...current,
          status: 'running',
          attempts: current.attempts + 1,
          workerId: input.workerId,
          leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString(),
          updatedAt: input.now
        });
        transaction.update(ref, next);
        this.costs.recordWrite();
        return next;
      });
      if (result) claimed.push(result);
    }
    return claimed;
  }

  complete(rawInput: ProjectionRepairQueueTaskActionInput): Promise<ProjectionRepairQueueTask> {
    return this.updateState(rawInput, 'completed');
  }

  fail(rawInput: ProjectionRepairQueueTaskActionInput): Promise<ProjectionRepairQueueTask> {
    return this.updateState(rawInput, 'failed');
  }

  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }

  private async updateState(rawInput: ProjectionRepairQueueTaskActionInput, requested: 'completed' | 'failed'): Promise<ProjectionRepairQueueTask> {
    const input = ProjectionRepairQueueTaskActionInputSchema.parse(rawInput);
    const now = parseDate(input.now);
    const ref = taskRef(this.firestore, input.taskId);
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      this.costs.recordRead(snapshot.exists ? 1 : 0);
      if (!snapshot.exists) throw new Error('REPAIR_TASK_NOT_FOUND');
      const current = parseTask(input.taskId, snapshot.data());
      if (current.status !== 'running') throw new Error('REPAIR_TASK_NOT_RUNNING');
      if (current.workerId !== input.workerId) throw new Error('REPAIR_TASK_LEASE_MISMATCH');
      if (current.leaseUntil && parseDate(current.leaseUntil).getTime() <= now.getTime()) throw new Error('REPAIR_TASK_LEASE_EXPIRED');
      const exhausted = requested === 'failed' && current.attempts >= MAX_ATTEMPTS;
      const nextStatus = requested === 'completed' ? 'completed' : exhausted ? 'failed' : 'queued';
      const retryAt = new Date(now.getTime() + Math.min(30, 2 ** current.attempts) * 1000).toISOString();
      const next = ProjectionRepairQueueTaskSchema.parse({
        ...current,
        status: nextStatus,
        updatedAt: input.now,
        ...(nextStatus === 'queued' ? { nextAttemptAt: retryAt } : {}),
        ...(input.errorCode ? { lastErrorCode: input.errorCode } : {})
      });
      transaction.update(ref, next);
      this.costs.recordWrite();
      return next;
    });
  }
}
