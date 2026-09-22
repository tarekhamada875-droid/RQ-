import crypto from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  DeletionAdvanceInputSchema,
  DeletionJobSchema,
  DeletionResultSchema,
  DeletionResumeInputSchema,
  DeletionStartInputSchema,
  type DeletionAdvanceInput,
  type DeletionJob,
  type DeletionResult,
  type DeletionResumeInput,
  type DeletionStartInput
} from '../contracts/deletion.js';
import { advanceGarageDeletion, resumeGarageDeletion, startGarageDeletion } from '../domain/garageDeletion.js';
import { idempotencyFingerprint } from '../domain/operations.js';
import { CostCounter, type ReadCost } from './packageCatalog.js';

const StoredResultSchema = z.object({ fingerprint: z.string().length(64), responseJson: z.string().max(30000), createdAt: z.unknown() }).strict();
const StoredGarageSchema = z.object({ isDeleting: z.boolean().optional(), updatedAt: z.unknown().optional(), createdAt: z.unknown().optional() }).passthrough();

type TimestampLike = Readonly<{ toDate(): Date }>;
function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value !== null && typeof value === 'object' && 'toDate' in value && typeof (value as TimestampLike).toDate === 'function') return (value as TimestampLike).toDate();
  if (typeof value === 'string') return new Date(value);
  return new Date(NaN);
}
function iso(value: unknown): string {
  const date = asDate(value);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_UPDATEDAT');
  return date.toISOString();
}
function mapJob(id: string, raw: unknown): DeletionJob {
  const value = DeletionJobSchema.parse({ ...raw as Record<string, unknown>, id, updatedAt: iso((raw as Record<string, unknown>).updatedAt) });
  return value;
}
function operationKey(actorUid: string, operation: string, idempotencyKey: string): string {
  return crypto.createHash('sha256').update(`garage.deletion:${actorUid}:${operation}:${idempotencyKey}`).digest('hex');
}
function parseStored(raw: unknown): DeletionResult {
  const stored = StoredResultSchema.parse(raw);
  return DeletionResultSchema.parse(JSON.parse(stored.responseJson));
}
function storedJobRef(firestore: Firestore, jobId: string) {
  return firestore.doc(`garage_deletion_jobs/${jobId}`);
}

export interface GarageDeletionRepository {
  start(input: DeletionStartInput): Promise<DeletionResult>;
  advance(input: DeletionAdvanceInput): Promise<DeletionResult>;
  resume(input: DeletionResumeInput): Promise<DeletionResult>;
}

export class FirestoreGarageDeletionRepository implements GarageDeletionRepository {
  constructor(private readonly firestore: Firestore, private readonly costs = new CostCounter()) {}
  getCostSnapshot(): ReadCost { return this.costs.snapshot(); }

  start(input: DeletionStartInput): Promise<DeletionResult> {
    return this.executeStart(DeletionStartInputSchema.parse(input));
  }
  advance(input: DeletionAdvanceInput): Promise<DeletionResult> {
    return this.executeAdvance(DeletionAdvanceInputSchema.parse(input));
  }
  resume(input: DeletionResumeInput): Promise<DeletionResult> {
    return this.executeResume(DeletionResumeInputSchema.parse(input));
  }

  private async executeStart(command: DeletionStartInput): Promise<DeletionResult> {
    const fingerprint = idempotencyFingerprint('garage.deletion.start', { garageId: command.garageId, actorUid: command.actorUid, idempotencyKey: command.idempotencyKey });
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'start', command.idempotencyKey));
      const garageRef = this.firestore.doc(`garages/${command.garageId}`);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStored(stored);
      }
      const garageSnapshot = await transaction.get(garageRef);
      this.costs.recordRead(garageSnapshot.exists ? 1 : 0);
      if (!garageSnapshot.exists) throw new Error('GARAGE_NOT_FOUND');
      const garage = StoredGarageSchema.parse(garageSnapshot.data());
      if (garage.isDeleting === true) throw new Error('GARAGE_DELETION_IN_PROGRESS');
      const now = new Date(command.occurredAt);
      const job = startGarageDeletion(command.garageId, now);
      const result = DeletionResultSchema.parse({ job });
      transaction.update(garageRef, { isDeleting: true, updatedAt: now });
      transaction.create(storedJobRef(this.firestore, job.id), { ...job, updatedAt: now });
      this.writeAudit(transaction, command, 'start', result, now);
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: now });
      this.costs.recordWrite(4);
      return result;
    });
  }

  private async executeAdvance(command: DeletionAdvanceInput): Promise<DeletionResult> {
    const fingerprint = idempotencyFingerprint('garage.deletion.advance', { garageId: command.garageId, jobId: command.jobId, actorUid: command.actorUid, idempotencyKey: command.idempotencyKey, deletedCount: command.deletedCount, nextCursor: command.nextCursor, repairNeeded: command.repairNeeded, error: command.error });
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'advance', command.idempotencyKey));
      const jobRef = storedJobRef(this.firestore, command.jobId);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStored(stored);
      }
      const jobSnapshot = await transaction.get(jobRef);
      this.costs.recordRead(jobSnapshot.exists ? 1 : 0);
      if (!jobSnapshot.exists) throw new Error('DELETION_JOB_NOT_FOUND');
      const current = mapJob(jobSnapshot.id, jobSnapshot.data());
      if (current.garageId !== command.garageId) throw new Error('DELETION_JOB_TARGET_MISMATCH');
      const next = advanceGarageDeletion(current, { deletedCount: command.deletedCount, ...(command.nextCursor !== undefined ? { nextCursor: command.nextCursor } : {}), ...(command.repairNeeded !== undefined ? { repairNeeded: command.repairNeeded } : {}), ...(command.error !== undefined ? { error: command.error } : {}), updatedAt: new Date(command.occurredAt) });
      const result = DeletionResultSchema.parse({ job: next });
      transaction.update(jobRef, { ...next, updatedAt: new Date(command.occurredAt) });
      this.writeAudit(transaction, command, 'advance', result, new Date(command.occurredAt));
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: new Date(command.occurredAt) });
      this.costs.recordWrite(3);
      return result;
    });
  }

  private async executeResume(command: DeletionResumeInput): Promise<DeletionResult> {
    const fingerprint = idempotencyFingerprint('garage.deletion.resume', { garageId: command.garageId, jobId: command.jobId, actorUid: command.actorUid, idempotencyKey: command.idempotencyKey });
    this.costs.recordTransactionAttempt();
    return this.firestore.runTransaction(async (transaction) => {
      const idempotencyRef = this.firestore.collection('idempotency_records').doc(operationKey(command.actorUid, 'resume', command.idempotencyKey));
      const jobRef = storedJobRef(this.firestore, command.jobId);
      const idempotencySnapshot = await transaction.get(idempotencyRef);
      this.costs.recordRead(idempotencySnapshot.exists ? 1 : 0);
      if (idempotencySnapshot.exists) {
        const stored = StoredResultSchema.parse(idempotencySnapshot.data());
        if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE');
        return parseStored(stored);
      }
      const jobSnapshot = await transaction.get(jobRef);
      this.costs.recordRead(jobSnapshot.exists ? 1 : 0);
      if (!jobSnapshot.exists) throw new Error('DELETION_JOB_NOT_FOUND');
      const current = mapJob(jobSnapshot.id, jobSnapshot.data());
      if (current.garageId !== command.garageId) throw new Error('DELETION_JOB_TARGET_MISMATCH');
      const now = new Date(command.occurredAt);
      const next = resumeGarageDeletion(current, now);
      const result = DeletionResultSchema.parse({ job: next });
      transaction.update(jobRef, { ...next, updatedAt: now });
      this.writeAudit(transaction, command, 'resume', result, now);
      transaction.create(idempotencyRef, { fingerprint, responseJson: JSON.stringify(result), createdAt: now });
      this.costs.recordWrite(3);
      return result;
    });
  }

  private writeAudit(transaction: Transaction, command: { garageId: string; actorUid: string; idempotencyKey: string }, operation: string, result: DeletionResult, occurredAt: Date): void {
    const eventRef = this.firestore.collection('business_events').doc();
    transaction.create(eventRef, {
      garageId: command.garageId,
      aggregateType: 'garage_deletion_job',
      aggregateId: result.job.id,
      eventType: `garage_deletion_${operation}`,
      actorUid: command.actorUid,
      occurredAt,
      idempotencyKey: command.idempotencyKey,
      payload: { job: result.job, physicalDeletion: false }
    });
  }
}

export class InMemoryGarageDeletionRepository implements GarageDeletionRepository {
  private readonly jobs = new Map<string, DeletionJob>();
  private readonly keys = new Map<string, { fingerprint: string; result: DeletionResult }>();
  constructor(private readonly garages: Set<string> = new Set()) {}
  async start(input: DeletionStartInput): Promise<DeletionResult> { const command = DeletionStartInputSchema.parse(input); return this.run(command.actorUid, 'start', command.idempotencyKey, { garageId: command.garageId }, () => { if (!this.garages.has(command.garageId)) throw new Error('GARAGE_NOT_FOUND'); const job = startGarageDeletion(command.garageId, new Date(command.occurredAt)); this.jobs.set(job.id, job); this.garages.delete(command.garageId); return { job }; }); }
  async advance(input: DeletionAdvanceInput): Promise<DeletionResult> { const command = DeletionAdvanceInputSchema.parse(input); return this.run(command.actorUid, 'advance', command.idempotencyKey, command, () => { const job = this.jobs.get(command.jobId); if (!job) throw new Error('DELETION_JOB_NOT_FOUND'); if (job.garageId !== command.garageId) throw new Error('DELETION_JOB_TARGET_MISMATCH'); const next = advanceGarageDeletion(job, { deletedCount: command.deletedCount, ...(command.nextCursor !== undefined ? { nextCursor: command.nextCursor } : {}), ...(command.repairNeeded !== undefined ? { repairNeeded: command.repairNeeded } : {}), ...(command.error !== undefined ? { error: command.error } : {}), updatedAt: new Date(command.occurredAt) }); this.jobs.set(next.id, next); return { job: next }; }); }
  async resume(input: DeletionResumeInput): Promise<DeletionResult> { const command = DeletionResumeInputSchema.parse(input); return this.run(command.actorUid, 'resume', command.idempotencyKey, command, () => { const job = this.jobs.get(command.jobId); if (!job) throw new Error('DELETION_JOB_NOT_FOUND'); if (job.garageId !== command.garageId) throw new Error('DELETION_JOB_TARGET_MISMATCH'); const next = resumeGarageDeletion(job, new Date(command.occurredAt)); this.jobs.set(next.id, next); return { job: next }; }); }
  private run(actorUid: string, operation: string, key: string, payload: unknown, action: () => DeletionResult): DeletionResult { const fingerprint = idempotencyFingerprint(`garage.deletion.${operation}`, payload); const id = `${actorUid}:${operation}:${key}`; const stored = this.keys.get(id); if (stored) { if (stored.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_KEY_REUSE'); return stored.result; } const result = DeletionResultSchema.parse(action()); this.keys.set(id, { fingerprint, result }); return result; }
}
