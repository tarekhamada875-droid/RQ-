import { describe, expect, it } from 'vitest';
import { garageDocumentToDeletionState, deletionJobDocumentToState } from './adapters/garageDeletionAdapter';
import { decideGarageDeletion } from './domain/garageDeletion';

describe('garage deletion policy characterization', () => {
  it('converts legacy garage and deletion-job records into explicit state', () => {
    expect(garageDocumentToDeletionState({ name: 'Garage One', isDeleting: true })).toEqual({ exists: true, name: 'Garage One' });
    expect(deletionJobDocumentToState({ status: 'running', updatedAt: new Date() })).toEqual({ exists: true, status: 'running' });
    expect(deletionJobDocumentToState(null)).toEqual({ exists: false });
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
      deletionJobDocumentToState({ status: 'running' }),
    )).toEqual({ ok: false, error: 'GARAGE_NOT_FOUND' });
  });

  it('marks a running deletion job as resumable', () => {
    expect(decideGarageDeletion(
      { callerRole: 'admin', garageId: 'garage_1' },
      garageDocumentToDeletionState({ name: 'Garage One' }),
      deletionJobDocumentToState({ status: 'running' }),
    )).toMatchObject({ ok: true, value: { kind: 'delete', resume: true } });
  });
});
