import { describe, expect, it } from 'vitest';
import { decideVehicleCheckIn } from './domain/vehicleCheckIn';
import { decideVehicleCheckOut } from './domain/vehicleCheckOut';

const garageIn = {
  exists: true,
  isDeleting: false,
  isLocked: false,
  isSuspended: false,
  balanceExpiryMs: Date.parse('2026-10-01T00:00:00.000Z'),
  dailyCapacity: 20,
  todayCount: 1,
  lastTransactionDate: '2026-09-25',
  isSubscriberAuthoritative: false,
  activePackageName: 'Standard',
  prepaidCreditsEnabled: true,
};

const garageOut = { exists: true, lastTransactionDate: '2026-09-25' };

/**
 * C4 policy contract:
 * - A locked or suspended garage cannot accept a new vehicle.
 * - A vehicle already inside remains eligible for checkout/correction.
 * This prevents new exposure while preserving an exit path for existing cars.
 */
describe('vehicle authorization policy', () => {
  it.each([
    ['locked', { ...garageIn, isLocked: true }],
    ['suspended', { ...garageIn, isSuspended: true }],
    ['locked and suspended', { ...garageIn, isLocked: true, isSuspended: true }],
  ])('blocks check-in for a %s garage at the decision boundary', (_label, garage) => {
    expect(decideVehicleCheckIn(garage, { exists: false })).toEqual({
      ok: false,
      error: 'GARAGE_CHECK_IN_LOCKED',
    });
  });

  it('allows checkout of an existing vehicle while the garage is locked or suspended', () => {
    expect(decideVehicleCheckOut(
      { today: '2026-09-25', cost: 125 },
      garageOut,
      { exists: true, status: 'inside' },
    )).toEqual({ ok: true, value: { cost: 125, isNewDay: false } });
  });

  it('rejects invalid vehicle transitions before any route adapter can write', () => {
    expect(decideVehicleCheckIn(garageIn, { exists: true, status: 'inside' })).toEqual({
      ok: false,
      error: 'VEHICLE_ALREADY_INSIDE',
    });
    expect(decideVehicleCheckOut(
      { today: '2026-09-25', cost: 125 },
      garageOut,
      { exists: true, status: 'outside' },
    )).toEqual({ ok: false, error: 'VEHICLE_ALREADY_OUTSIDE' });
  });
});
