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
const command = { today: '2026-09-24', nowMs: Date.parse('2026-09-24T12:00:00.000Z'), plateNumber: 'ABC 123', plateNumberRaw: 'ABC123' };
const garage = () => garageDocumentToCheckInState(baseGarage, false);

describe('credit-only vehicle check-in authorization', () => {
  it('converts garage and vehicle documents into explicit states', () => {
    expect(garage()).toMatchObject({ exists: true, prepaidCreditsEnabled: true });
    expect(vehicleDocumentToCheckInState({ status: 'outside' })).toEqual({ exists: true, status: 'outside' });
    expect(vehicleDocumentToCheckInState({})).toEqual({ exists: true });
    expect(vehicleDocumentToCheckInState(null)).toEqual({ exists: false });
  });

  it('allows a new vehicle and a previously checked-out vehicle', () => {
    const expected = { ok: true, value: { isUnlimited: true, isNewDay: false, used: 0, capacity: 0 } };
    expect(decideVehicleCheckIn(command, garage(), { exists: false }, null)).toEqual(expected);
    expect(decideVehicleCheckIn(command, garage(), { exists: true, status: 'outside' }, null)).toEqual(expected);
  });

  it('retains operational locks and subscriber authority protections', () => {
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, isDeleting: true }, false), { exists: false }, null)).toEqual({ ok: false, error: 'GARAGE_DELETION_IN_PROGRESS' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, isLocked: true }, false), { exists: false }, null)).toEqual({ ok: false, error: 'GARAGE_CHECK_IN_LOCKED' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState(baseGarage, true), { exists: false }, null)).toEqual({ ok: false, error: 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN' });
  });

  it.each([
    ['inside', { exists: true, status: 'inside' }],
    ['missing status', { exists: true }],
    ['pending status', { exists: true, status: 'pending' }],
    ['corrupt status', { exists: true, status: 'corrupt' }],
  ])('rejects an existing vehicle with %s', (_label, vehicleState) => {
    expect(decideVehicleCheckIn(command, garage(), vehicleState, null)).toEqual({ ok: false, error: 'VEHICLE_ALREADY_INSIDE' });
  });
});
