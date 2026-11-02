import { describe, expect, it } from 'vitest';
import { garageDocumentToCheckInState, vehicleDocumentToCheckInState } from './adapters/vehicleCheckInAdapter';
import { decideVehicleCheckIn } from './domain/vehicleCheckIn';

const baseGarage = {
  isDeleting: false,
  isLocked: false,
  isSuspended: false,
  balanceExpiry: '2020-01-01T00:00:00.000Z',
  dailyCapacity: 20,
  todayCount: 99,
  lastTransactionDate: '2026-09-24',
  activePackageName: 'Legacy package',
  billingModel: 'subscription',
};
const garage = () => garageDocumentToCheckInState(baseGarage, false);

describe('credit-only vehicle check-in authorization', () => {
  it('converts garage and vehicle documents into explicit states', () => {
    expect(garage()).toMatchObject({ exists: true, isSubscriberAuthoritative: false, lastTransactionDate: '2026-09-24' });
    expect(vehicleDocumentToCheckInState({ status: 'outside' })).toEqual({ exists: true, status: 'outside' });
    expect(vehicleDocumentToCheckInState({})).toEqual({ exists: true });
    expect(vehicleDocumentToCheckInState(null)).toEqual({ exists: false });
  });

  it('allows a new vehicle and a previously checked-out vehicle, flagging a new day when the last transaction was on a different date', () => {
    // baseGarage.lastTransactionDate = '2026-09-24'; a check-in on 2026-09-25 is a new day.
    expect(decideVehicleCheckIn({ today: '2026-09-25' }, garage(), { exists: false }))
      .toEqual({ ok: true, value: { isUnlimited: true, isNewDay: true } });
    expect(decideVehicleCheckIn({ today: '2026-09-25' }, garage(), { exists: true, status: 'outside' }))
      .toEqual({ ok: true, value: { isUnlimited: true, isNewDay: true } });
  });

  it('reports isNewDay=false when the last transaction was on the same date', () => {
    expect(decideVehicleCheckIn({ today: '2026-09-24' }, garage(), { exists: false }))
      .toEqual({ ok: true, value: { isUnlimited: true, isNewDay: false } });
  });

  it('treats a missing lastTransactionDate as a new day', () => {
    const freshGarage = garageDocumentToCheckInState({ ...baseGarage, lastTransactionDate: undefined }, false);
    expect(decideVehicleCheckIn({ today: '2026-09-24' }, freshGarage, { exists: false }))
      .toEqual({ ok: true, value: { isUnlimited: true, isNewDay: true } });
  });

  it('retains operational locks and subscriber authority protections', () => {
    expect(decideVehicleCheckIn({ today: '2026-09-25' }, garageDocumentToCheckInState({ ...baseGarage, isDeleting: true }, false), { exists: false })).toEqual({ ok: false, error: 'GARAGE_DELETION_IN_PROGRESS' });
    expect(decideVehicleCheckIn({ today: '2026-09-25' }, garageDocumentToCheckInState({ ...baseGarage, isLocked: true }, false), { exists: false })).toEqual({ ok: false, error: 'GARAGE_CHECK_IN_LOCKED' });
    expect(decideVehicleCheckIn({ today: '2026-09-25' }, garageDocumentToCheckInState(baseGarage, true), { exists: false })).toEqual({ ok: false, error: 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN' });
  });

  it.each([
    ['inside', { exists: true, status: 'inside' }],
    ['missing status', { exists: true }],
    ['pending status', { exists: true, status: 'pending' }],
    ['corrupt status', { exists: true, status: 'corrupt' }],
  ])('rejects an existing vehicle with %s', (_label, vehicleState) => {
    expect(decideVehicleCheckIn({ today: '2026-09-25' }, garage(), vehicleState)).toEqual({ ok: false, error: 'VEHICLE_ALREADY_INSIDE' });
  });
});
