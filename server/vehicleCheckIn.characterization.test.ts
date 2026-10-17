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

describe('credit-only vehicle check-in authorization', () => {
  it('converts any garage record into an explicit credit-enabled state', () => {
    expect(garageDocumentToCheckInState(baseGarage, false)).toMatchObject({
      exists: true,
      prepaidCreditsEnabled: true,
    });
    expect(vehicleDocumentToCheckInState({ status: 'outside' })).toEqual({ exists: true, status: 'outside' });
    expect(vehicleDocumentToCheckInState(null)).toEqual({ exists: false });
  });

  it('allows check-in without legacy expiry or capacity gates', () => {
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState(baseGarage, false), { exists: false }, null)).toEqual({
      ok: true, value: { isUnlimited: true, isNewDay: false, used: 0, capacity: 0 },
    });
  });

  it('retains operational locks and subscriber authority protections', () => {
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, isDeleting: true }, false), { exists: false }, null)).toEqual({ ok: false, error: 'GARAGE_DELETION_IN_PROGRESS' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, isLocked: true }, false), { exists: false }, null)).toEqual({ ok: false, error: 'GARAGE_CHECK_IN_LOCKED' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState(baseGarage, true), { exists: false }, null)).toEqual({ ok: false, error: 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN' });
  });

  it('rejects a vehicle that is already inside', () => {
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState(baseGarage, false), { exists: true, status: 'inside' }, null)).toEqual({ ok: false, error: 'VEHICLE_ALREADY_INSIDE' });
  });
});
