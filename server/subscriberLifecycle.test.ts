import { describe, expect, it } from 'vitest';
import {
  decideSubscriberAdd,
  decideSubscriberDelete,
  decideSubscriberRenew,
  decideSubscriberUpdate,
  type SubscriberState,
} from './domain/subscriberLifecycle';

const existing: SubscriberState = {
  plateNumber: 'ABC 123',
  plateNumberRaw: 'ABC123',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  ownerName: 'Owner',
};

describe('V3 subscriber lifecycle decisions', () => {
  it('creates a subscriber from a valid command', () => {
    expect(decideSubscriberAdd(null, {
      plateNumber: 'ABC 123', plateNumberRaw: 'ABC123', startDate: '2026-09-01', endDate: '2026-09-30', ownerName: 'Owner',
    })).toEqual({ ok: true, value: { kind: 'created', state: existing } });
  });

  it('rejects duplicate creation and reversed dates', () => {
    expect(decideSubscriberAdd(existing, { plateNumber: 'ABC 123', plateNumberRaw: 'ABC123', startDate: '2026-09-01', endDate: '2026-09-30' })).toEqual({ ok: false, error: 'SUBSCRIBER_ALREADY_EXISTS' });
    expect(decideSubscriberAdd(null, { plateNumber: 'ABC 123', plateNumberRaw: 'ABC123', startDate: '2026-10-01', endDate: '2026-09-30' })).toEqual({ ok: false, error: 'INVALID_SUBSCRIBER_DATE_RANGE' });
  });

  it('renews an existing subscriber and rejects a missing one', () => {
    expect(decideSubscriberRenew(existing, { startDate: '2026-10-01', endDate: '2026-10-31' })).toEqual({ ok: true, value: { kind: 'renewed', state: { ...existing, startDate: '2026-10-01', endDate: '2026-10-31' } } });
    expect(decideSubscriberRenew(null, { startDate: '2026-10-01', endDate: '2026-10-31' })).toEqual({ ok: false, error: 'SUBSCRIBER_NOT_FOUND' });
  });

  it('updates mutable fields but protects the plate identity', () => {
    expect(decideSubscriberUpdate(existing, { startDate: existing.startDate, endDate: existing.endDate, ownerName: 'New owner' })).toEqual({ ok: true, value: { kind: 'updated', state: { ...existing, ownerName: 'New owner' } } });
    expect(decideSubscriberUpdate(existing, { startDate: existing.startDate, endDate: existing.endDate, plateNumberRaw: 'XYZ999' })).toEqual({ ok: false, error: 'SUBSCRIBER_PLATE_IMMUTABLE' });
  });

  it('deletes an existing subscriber and reports missing records', () => {
    expect(decideSubscriberDelete(existing)).toEqual({ ok: true, value: { kind: 'deleted' } });
    expect(decideSubscriberDelete(null)).toEqual({ ok: false, error: 'SUBSCRIBER_NOT_FOUND' });
  });
});
