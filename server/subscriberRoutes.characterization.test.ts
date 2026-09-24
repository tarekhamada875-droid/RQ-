import { describe, expect, it } from 'vitest';
import { createRequestFingerprint } from './idempotency';
import { mapDomainErrorToStatus } from './routes/helpers';
import {
  addRequestToCommand,
  lifecycleErrorToLegacyError,
  renewRequestToDates,
  subscriberDocumentToState,
  transitionToFirestoreUpdate,
  updateRequestToCommand,
} from './adapters/subscriberLifecycleAdapter';
import {
  decideSubscriberAdd,
  decideSubscriberDelete,
  decideSubscriberRenew,
  decideSubscriberUpdate,
  type SubscriberState,
} from './domain/subscriberLifecycle';

const currentDocument = {
  id: 'plate_QUJDMTIz',
  plateNumber: 'ABC 123',
  plateNumberRaw: 'ABC123',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  ownerName: 'Owner',
  phone: '01000000000',
  notes: 'existing note',
  garageId: 'garage_1',
};

const currentState: SubscriberState = {
  plateNumber: 'ABC 123',
  plateNumberRaw: 'ABC123',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  ownerName: 'Owner',
  phone: '01000000000',
  notes: 'existing note',
};

describe('production subscriber route characterization', () => {
  it('normalizes the legacy Firestore document into explicit domain state', () => {
    expect(subscriberDocumentToState(currentDocument)).toEqual(currentState);
  });

  it('preserves add route normalization and excludes persistence metadata', () => {
    const command = addRequestToCommand(
      { ...currentDocument, id: 'client-id', createdAt: new Date(), costUnits: 99 },
      { plateNumber: 'ABC 123', plateRaw: 'ABC123' },
      { startDate: '2026-10-01', endDate: '2026-10-31' },
    );
    expect(command).toEqual({
      plateNumber: 'ABC 123',
      plateNumberRaw: 'ABC123',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      ownerName: 'Owner',
      phone: '01000000000',
      notes: 'existing note',
    });
    expect(decideSubscriberAdd(null, command)).toMatchObject({ ok: true, value: { kind: 'created' } });
  });

  it('characterizes the deterministic add conflict', () => {
    const result = decideSubscriberAdd(currentState, {
      plateNumber: 'ABC 123', plateNumberRaw: 'ABC123', startDate: '2026-10-01', endDate: '2026-10-31',
    });
    expect(result).toEqual({ ok: false, error: 'SUBSCRIBER_ALREADY_EXISTS' });
    expect(mapDomainErrorToStatus(lifecycleErrorToLegacyError('SUBSCRIBER_ALREADY_EXISTS'))).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('preserves renew dates and the missing-record contract', () => {
    const dates = renewRequestToDates({}, { startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(decideSubscriberRenew(currentState, dates)).toEqual({ ok: true, value: { kind: 'renewed', state: { ...currentState, ...dates } } });
    expect(decideSubscriberRenew(null, dates)).toEqual({ ok: false, error: 'SUBSCRIBER_NOT_FOUND' });
    expect(mapDomainErrorToStatus(lifecycleErrorToLegacyError('SUBSCRIBER_NOT_FOUND'))).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('limits update persistence to the existing route allowlist', () => {
    const merged = { ...currentDocument, ownerName: 'New owner', ignored: 'must not persist' };
    const command = updateRequestToCommand(merged, currentState, { startDate: currentState.startDate, endDate: currentState.endDate });
    const result = decideSubscriberUpdate(currentState, command);
    expect(result).toMatchObject({ ok: true, value: { kind: 'updated' } });
    if (!result.ok) throw new Error('expected update decision');
    expect(transitionToFirestoreUpdate(result.value)).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      ownerName: 'New owner',
      phone: '01000000000',
      notes: 'existing note',
    });
    expect(transitionToFirestoreUpdate(result.value)).not.toHaveProperty('ignored');
  });

  it('preserves immutable plate and deletion contracts', () => {
    expect(decideSubscriberUpdate(currentState, {
      plateNumber: 'XYZ 999', plateNumberRaw: 'XYZ999', startDate: currentState.startDate, endDate: currentState.endDate,
    })).toEqual({ ok: false, error: 'SUBSCRIBER_PLATE_IMMUTABLE' });
    expect(decideSubscriberDelete(currentState)).toEqual({ ok: true, value: { kind: 'deleted' } });
    expect(decideSubscriberDelete(null)).toEqual({ ok: false, error: 'SUBSCRIBER_NOT_FOUND' });
  });

  it('uses stable operation payloads for idempotency fingerprints', () => {
    const first = createRequestFingerprint({ garageId: 'garage_1', subscriberId: 'sub_1', newDates: { endDate: '2026-10-31', startDate: '2026-10-01' } });
    const reordered = createRequestFingerprint({ subscriberId: 'sub_1', newDates: { startDate: '2026-10-01', endDate: '2026-10-31' }, garageId: 'garage_1' });
    const changed = createRequestFingerprint({ garageId: 'garage_1', subscriberId: 'sub_1', newDates: { startDate: '2026-10-01', endDate: '2026-11-01' } });
    expect(first).toBe(reordered);
    expect(changed).not.toBe(first);
  });
});
