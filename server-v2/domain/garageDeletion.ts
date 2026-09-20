import crypto from 'node:crypto';
import { DeletionJobSchema, type DeletionJob } from '../contracts/deletion.js';
import { decodeCursor, encodeCursor, type PageCursor } from './pagination.js';

export type DeletionPageInput = Readonly<{
  deletedCount: number;
  nextCursor?: string;
  repairNeeded?: boolean;
  error?: string;
  updatedAt: Date;
}>;

export function startGarageDeletion(garageId: string, now: Date): DeletionJob {
  if (!garageId) throw new Error('GARAGE_ID_REQUIRED');
  if (Number.isNaN(now.getTime())) throw new Error('INVALID_DATE');
  return DeletionJobSchema.parse({ id: `deletion_${crypto.randomUUID()}`, garageId, phase: 'queued', deletedCount: 0, updatedAt: now.toISOString() });
}

export function advanceGarageDeletion(job: DeletionJob, input: DeletionPageInput): DeletionJob {
  const current = DeletionJobSchema.parse(job);
  if (current.phase === 'completed') throw new Error('DELETION_ALREADY_COMPLETED');
  if (Number.isNaN(input.updatedAt.getTime())) throw new Error('INVALID_DATE');
  if (!Number.isInteger(input.deletedCount) || input.deletedCount < 0 || input.deletedCount > 100) throw new Error('DELETION_PAGE_TOO_LARGE');
  if (input.repairNeeded) {
    if (!input.error) throw new Error('REPAIR_REASON_REQUIRED');
    return DeletionJobSchema.parse({ ...current, phase: 'repair_needed', lastError: input.error, updatedAt: input.updatedAt.toISOString() });
  }
  const cursor = input.nextCursor ? decodeCursor(input.nextCursor) : undefined;
  const next = {
    ...current,
    phase: cursor ? 'deleting' : 'completed',
    deletedCount: current.deletedCount + input.deletedCount,
    updatedAt: input.updatedAt.toISOString(),
    ...(cursor ? { cursor } : {})
  };
  return DeletionJobSchema.parse(next);
}

export function resumeGarageDeletion(job: DeletionJob, now: Date): DeletionJob {
  const current = DeletionJobSchema.parse(job);
  if (current.phase !== 'repair_needed') throw new Error('DELETION_NOT_REPAIRABLE');
  if (Number.isNaN(now.getTime())) throw new Error('INVALID_DATE');
  const resumed: { phase: 'deleting'; updatedAt: string; id: string; garageId: string; deletedCount: number; cursor?: PageCursor } = {
    id: current.id, garageId: current.garageId, phase: 'deleting', deletedCount: current.deletedCount, updatedAt: now.toISOString()
  };
  if (current.cursor) resumed.cursor = current.cursor;
  return DeletionJobSchema.parse(resumed);
}

export { encodeCursor };
