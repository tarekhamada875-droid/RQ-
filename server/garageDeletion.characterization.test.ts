import { describe, expect, it } from 'vitest';
import { garageDocumentToDeletionState, deletionJobDocumentToState } from './adapters/garageDeletionAdapter';
import { decideGarageDeletion, isGarageDeletionClaimActive } from './domain/garageDeletion';

describe('garage deletion policy characterization', () => {
  it('converts legacy garage and deletion-job records into explicit state', () => {
    expect(garageDocumentToDeletionState({ name: 'Garage One', isDeleting: true })).toEqual({ exists: true, name: 'Garage One' });
    const updatedAt = new Date('2026-10-10T07:00:00.000Z');
    const leaseExpiresAt = new Date('2026-10-10T07:05:00.000Z');
    expect(deletionJobDocumentToState({ status: 'running', garageName: 'Garage One', updatedAt, leaseExpiresAt })).toEqual({
      exists: true,
      status: 'running',
      garageName: 'Garage One',
      updatedAt,
      leaseExpiresAt
    });
    expect(deletionJobDocumentToState(null)).toEqual({ exists: false });
  });

  it('identifies active leases and permits expired or failed jobs to be reclaimed', () => {
    const now = new Date('2026-10-10T07:00:00.000Z').getTime();
    expect(isGarageDeletionClaimActive({ exists: true, status: 'running', leaseExpiresAt: new Date(now + 1000) }, now)).toBe(true);
    expect(isGarageDeletionClaimActive({ exists: true, status: 'running', leaseExpiresAt: new Date(now - 1000) }, now)).toBe(false);
    expect(isGarageDeletionClaimActive({ exists: true, status: 'running', updatedAt: new Date(now - 1000) }, now)).toBe(true);
    expect(isGarageDeletionClaimActive({ exists: true, status: 'failed', updatedAt: new Date(now) }, now)).toBe(false);
  });

  it('allows only admins to enter the destructive deletion plan', () => {
    expect(decideGarageDeletion(
      { callerRole: 'garage', garageId: 'garage_1' },
      garageDocumentToDeletionState({ name: 'Garage One' }),
      deletionJobDocumentToState(null),
    )).toEqual({ ok: false, error: 'FORBIDDEN_ADMIN_REQUIRED' });
    expect(decideGarageDeletion(
      { callerRole: 'admin', garageId: 'garage_1' },
      garageDocumentToDeletionState({ name: 'Garage One' }),
      deletionJobDocumentToState(null),
    )).toEqual({ ok: true, value: { kind: 'delete', garageId: 'garage_1', garageName: 'Garage One', resume: false } });
  });

  it('preserves missing-garage recovery semantics', () => {
    expect(decideGarageDeletion(
      { callerRole: 'admin', garageId: 'garage_1' },
      garageDocumentToDeletionState(null),
      deletionJobDocumentToState({ status: 'completed' }),
    )).toEqual({ ok: true, value: { kind: 'already_deleted', garageId: 'garage_1' } });
    expect(decideGarageDeletion(
      { callerRole: 'admin', garageId: 'garage_1' },
      garageDocumentToDeletionState(null),
      deletionJobDocumentToState({ status: 'running', garageName: 'Garage One' }),
    )).toEqual({ ok: true, value: { kind: 'delete', garageId: 'garage_1', garageName: 'Garage One', resume: true } });
  });

  it('marks a running deletion job as resumable', () => {
    expect(decideGarageDeletion(
      { callerRole: 'admin', garageId: 'garage_1' },
      garageDocumentToDeletionState({ name: 'Garage One' }),
      deletionJobDocumentToState({ status: 'running' }),
    )).toMatchObject({ ok: true, value: { kind: 'delete', resume: true } });
  });
});
