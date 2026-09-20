import { describe, expect, it } from 'vitest';
import type { IdempotencyRecord } from '../contracts/financial.js';
import { decideDeletionIdempotency } from '../domain/deletionIdempotency.js';
import { advanceGarageDeletion, encodeCursor, resumeGarageDeletion, startGarageDeletion } from '../domain/garageDeletion.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const fingerprint = 'a'.repeat(64);
const record: IdempotencyRecord = { key: 'delete-op-1', operation: 'garage.delete.page', fingerprint, status: 'completed', responseJson: '{"ok":true}', createdAt: now.toISOString() };

describe('v2 resumable garage deletion', () => {
  it('processes bounded pages and completes only when no cursor remains', () => {
    let job = startGarageDeletion('garage-1', now);
    const cursor = encodeCursor('subscriber-1', 'subscriber-1');
    job = advanceGarageDeletion(job, { deletedCount: 100, nextCursor: cursor, updatedAt: now });
    expect(job).toMatchObject({ phase: 'deleting', deletedCount: 100, cursor: { id: 'subscriber-1' } });
    job = advanceGarageDeletion(job, { deletedCount: 2, updatedAt: new Date('2026-09-20T10:01:00.000Z') });
    expect(job).toMatchObject({ phase: 'completed', deletedCount: 102 });
  });

  it('rejects unbounded pages and malformed cursors', () => {
    const job = startGarageDeletion('garage-1', now);
    expect(() => advanceGarageDeletion(job, { deletedCount: 101, updatedAt: now })).toThrow('DELETION_PAGE_TOO_LARGE');
    expect(() => advanceGarageDeletion(job, { deletedCount: 1, nextCursor: 'bad', updatedAt: now })).toThrow();
  });

  it('moves failed work into repair and resumes it explicitly', () => {
    const job = startGarageDeletion('garage-1', now);
    const repair = advanceGarageDeletion(job, { deletedCount: 4, repairNeeded: true, error: 'child collection failed', updatedAt: now });
    expect(repair).toMatchObject({ phase: 'repair_needed', deletedCount: 0, lastError: 'child collection failed' });
    const resumed = resumeGarageDeletion(repair, new Date('2026-09-20T10:02:00.000Z'));
    expect(resumed).toMatchObject({ phase: 'deleting', deletedCount: 0 });
  });

  it('uses replay-safe idempotency for deletion pages', () => {
    expect(decideDeletionIdempotency(record, 'delete-op-1', 'garage.delete.page', fingerprint)).toMatchObject({ kind: 'replay' });
    expect(decideDeletionIdempotency(record, 'delete-op-1', 'garage.delete.page', 'b'.repeat(64))).toEqual({ kind: 'conflict' });
  });
});
