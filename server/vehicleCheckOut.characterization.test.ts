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

  it('rejects missing, outside, and unknown vehicle states before accounting writes', () => {
    const garage = garageDocumentToCheckOutState({});
    expect(decideVehicleCheckOut(command, garageDocumentToCheckOutState(null), vehicleDocumentToCheckOutState({ status: 'inside' }))).toEqual({ ok: false, error: 'GARAGE_NOT_FOUND' });
    expect(decideVehicleCheckOut(command, garage, vehicleDocumentToCheckOutState(null))).toEqual({ ok: false, error: 'VEHICLE_NOT_FOUND' });
    for (const vehicle of [{ status: 'outside' }, {}, { status: 'pending' }, { status: 'corrupt' }]) {
      expect(decideVehicleCheckOut(command, garage, vehicleDocumentToCheckOutState(vehicle))).toEqual({ ok: false, error: 'VEHICLE_ALREADY_OUTSIDE' });
    }
    expect(decideVehicleCheckOut(command, garage, { exists: true })).toEqual({ ok: false, error: 'VEHICLE_ALREADY_OUTSIDE' });
  });

  it('rejects malformed checkout money before returning a write decision', () => {
    const garage = garageDocumentToCheckOutState({ lastTransactionDate: '2026-09-24' });
    const vehicle = vehicleDocumentToCheckOutState({ status: 'inside' });
    for (const cost of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.234]) {
      expect(decideVehicleCheckOut({ today: '2026-09-24', cost }, garage, vehicle)).toEqual({ ok: false, error: 'INVALID_MONEY_AMOUNT' });
    }
  });

  it('keeps the server-authoritative cost rules intact', () => {
    const now = Date.parse('2026-09-24T12:00:00.000Z');
    expect(calculateVehicleCost({ isSubscriber: true, entryTime: '2026-09-23T12:00:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(0);
    expect(calculateVehicleCost({ type: 'hourly', entryTime: '2026-09-24T11:58:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(0);
    expect(calculateVehicleCost({ type: 'hourly', entryTime: '2026-09-24T10:00:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(20);
    expect(calculateVehicleCost({ type: 'overnight', entryTime: '2026-09-23T12:00:00.000Z' }, { hourlyRate: 10, overnightRate: 100 }, now)).toBe(100);
  });
});
