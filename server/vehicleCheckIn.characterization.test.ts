import { describe, expect, it } from 'vitest';
import { garageDocumentToCheckInState, vehicleDocumentToCheckInState, fairUseResultToDecision } from './adapters/vehicleCheckInAdapter';
import { decideVehicleCheckIn } from './domain/vehicleCheckIn';

const baseGarage = {
  isDeleting: false,
  isLocked: false,
  isSuspended: false,
  balanceExpiry: '2026-10-01T00:00:00.000Z',
  dailyCapacity: 20,
  todayCount: 3,
  lastTransactionDate: '2026-09-24',
  activePackageName: 'Standard',
};
const command = { today: '2026-09-24', nowMs: Date.parse('2026-09-24T12:00:00.000Z'), plateNumber: 'ABC 123', plateNumberRaw: 'ABC123' };

describe('vehicle check-in characterization', () => {
  it('converts legacy garage and vehicle records into explicit state', () => {
    expect(garageDocumentToCheckInState(baseGarage, false)).toMatchObject({
      exists: true, balanceExpiryMs: Date.parse('2026-10-01T00:00:00.000Z'), dailyCapacity: 20, todayCount: 3,
    });
    expect(vehicleDocumentToCheckInState({ status: 'outside' })).toEqual({ exists: true, status: 'outside' });
    expect(vehicleDocumentToCheckInState(null)).toEqual({ exists: false });
  });

  it('allows a normal check-in and reports the current-day capacity accounting', () => {
    const result = decideVehicleCheckIn(command, garageDocumentToCheckInState(baseGarage, false), { exists: false }, null);
    expect(result).toEqual({ ok: true, value: { isUnlimited: false, isNewDay: false, used: 3, capacity: 20 } });
  });

  it('resets daily usage when the garage date changes', () => {
    const result = decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, lastTransactionDate: '2026-09-23', todayCount: 20 }, false), { exists: false }, null);
    expect(result).toMatchObject({ ok: true, value: { isNewDay: true, used: 0 } });
  });

  it('blocks locked, deleting, subscriber-authoritative, and expired garages', () => {
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, isDeleting: true }, false), { exists: false }, null)).toEqual({ ok: false, error: 'GARAGE_DELETION_IN_PROGRESS' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, isLocked: true }, false), { exists: false }, null)).toEqual({ ok: false, error: 'GARAGE_CHECK_IN_LOCKED' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState(baseGarage, true), { exists: false }, null)).toEqual({ ok: false, error: 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, balanceExpiry: '2026-09-23T00:00:00.000Z' }, false), { exists: false }, null)).toEqual({ ok: false, error: 'SUBSCRIPTION_EXPIRED' });
  });

  it('blocks capacity exhaustion and vehicles already inside', () => {
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState({ ...baseGarage, todayCount: 20, dailyCapacity: 20 }, false), { exists: false }, null)).toEqual({ ok: false, error: 'CAPACITY_LIMIT_REACHED' });
    expect(decideVehicleCheckIn(command, garageDocumentToCheckInState(baseGarage, false), { exists: true, status: 'inside' }, null)).toEqual({ ok: false, error: 'VEHICLE_ALREADY_INSIDE' });
  });

  it('uses fair-use decisions for unlimited garages', () => {
    const unlimited = garageDocumentToCheckInState({ ...baseGarage, dailyCapacity: 0, activePackageName: 'مفتوح' }, false);
    const fairUse = fairUseResultToDecision({
      allowed: true,
      autoExtended: true,
      updatedFairUse: {
        isActive: true, tierType: 'daily', cycleCarsCount: 1, currentAllowance: 200, maxAllowance: 400,
        stepAmount: 200, threshold: 20, extensionsCount: 0,
      },
    });
    expect(decideVehicleCheckIn(command, unlimited, { exists: false }, fairUse)).toMatchObject({ ok: true, value: { isUnlimited: true, fairUse } });
    expect(decideVehicleCheckIn(command, unlimited, { exists: false }, { allowed: false, autoExtended: false })).toEqual({ ok: false, error: 'FAIR_USE_LIMIT_REACHED' });
  });
});
