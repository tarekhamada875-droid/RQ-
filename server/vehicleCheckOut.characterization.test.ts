import { describe, expect, it } from 'vitest';
import { garageDocumentToCheckOutState, vehicleDocumentToCheckOutState } from './adapters/vehicleCheckOutAdapter';
import { decideVehicleCheckOut } from './domain/vehicleCheckOut';
import { calculateVehicleCost } from './utils';

const command = { today: '2026-09-24', cost: 125.5 };

describe('vehicle check-out characterization', () => {
  it('converts legacy garage and vehicle records into explicit state', () => {
    expect(garageDocumentToCheckOutState({ lastTransactionDate: '2026-09-24', ignored: true })).toEqual({ exists: true, lastTransactionDate: '2026-09-24' });
    expect(vehicleDocumentToCheckOutState({ status: 'inside', plateNumber: 'ABC 123' })).toEqual({ exists: true, status: 'inside' });
    expect(vehicleDocumentToCheckOutState(null)).toEqual({ exists: false });
  });

  it('returns the existing check-out cost and same-day accounting decision', () => {
    expect(decideVehicleCheckOut(command, garageDocumentToCheckOutState({ lastTransactionDate: '2026-09-24' }), vehicleDocumentToCheckOutState({ status: 'inside' }))).toEqual({
      ok: true,
      value: { cost: 125.5, isNewDay: false },
    });
    expect(decideVehicleCheckOut(command, garageDocumentToCheckOutState({ lastTransactionDate: '2026-09-23' }), vehicleDocumentToCheckOutState({ status: 'inside' }))).toMatchObject({ ok: true, value: { isNewDay: true } });
  });

  it('preserves missing-record and already-outside contracts', () => {
    expect(decideVehicleCheckOut(command, garageDocumentToCheckOutState(null), vehicleDocumentToCheckOutState({ status: 'inside' }))).toEqual({ ok: false, error: 'GARAGE_NOT_FOUND' });
    expect(decideVehicleCheckOut(command, garageDocumentToCheckOutState({}), vehicleDocumentToCheckOutState(null))).toEqual({ ok: false, error: 'VEHICLE_NOT_FOUND' });
    expect(decideVehicleCheckOut(command, garageDocumentToCheckOutState({}), vehicleDocumentToCheckOutState({ status: 'outside' }))).toEqual({ ok: false, error: 'VEHICLE_ALREADY_OUTSIDE' });
  });

  it('keeps the server-authoritative cost rules intact', () => {
    const now = Date.parse('2026-09-24T12:00:00.000Z');
    expect(calculateVehicleCost({ isSubscriber: true, entryTime: '2026-09-23T12:00:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(0);
    expect(calculateVehicleCost({ type: 'hourly', entryTime: '2026-09-24T11:58:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(0);
    expect(calculateVehicleCost({ type: 'hourly', entryTime: '2026-09-24T10:00:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(20);
    expect(calculateVehicleCost({ type: 'overnight', entryTime: '2026-09-23T12:00:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(100);
  });
});
