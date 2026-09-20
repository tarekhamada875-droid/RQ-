import { describe, expect, it } from 'vitest';
import type { IdempotencyRecord } from '../contracts/financial.js';
import { executeVehicleOperation } from '../domain/vehicleOperations.js';
import { decideVehicleOperationIdempotency } from '../domain/vehicleIdempotency.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const outsideVehicle = { id: 'vehicle-1', garageId: 'garage-1', plate: 'ABC123', status: 'outside' as const, updatedAt: '2026-09-20T09:00:00.000Z' };
const insideVehicle = { ...outsideVehicle, status: 'inside' as const, entryAt: '2026-09-20T09:30:00.000Z' };
const base = { garageId: 'garage-1', plate: 'ABC123', carsInside: 1, capacity: { dailyCapacity: 2 }, occurredAt: now };
const fingerprint = 'a'.repeat(64);
const existing: IdempotencyRecord = { key: 'vehicle-op-1', operation: 'vehicle.check_in', fingerprint, status: 'completed', responseJson: '{"ok":true}', createdAt: now.toISOString() };

describe('v2 vehicle lifecycle operations', () => {
  it('creates check-in and check-out operations only for valid current state', () => {
    expect(executeVehicleOperation({ ...base, operation: 'check_in', vehicle: outsideVehicle })).toMatchObject({ operation: 'check_in', vehicleId: 'vehicle-1', garageId: 'garage-1' });
    expect(executeVehicleOperation({ ...base, operation: 'check_out', vehicle: insideVehicle })).toMatchObject({ operation: 'check_out', vehicleId: 'vehicle-1' });
  });

  it.each([
    ['check_in' as const, insideVehicle, 'VEHICLE_ALREADY_INSIDE'],
    ['check_out' as const, outsideVehicle, 'VEHICLE_NOT_INSIDE']
  ])('rejects invalid lifecycle transition: %s', (operation, vehicle, errorCode) => {
    expect(() => executeVehicleOperation({ ...base, operation, vehicle })).toThrow(errorCode);
  });

  it('enforces capacity, garage scope, and plate identity', () => {
    expect(() => executeVehicleOperation({ ...base, operation: 'check_in', carsInside: 2, vehicle: outsideVehicle })).toThrow('CAPACITY_EXCEEDED');
    expect(() => executeVehicleOperation({ ...base, operation: 'check_in', garageId: 'garage-2', vehicle: outsideVehicle })).toThrow('GARAGE_SCOPE_MISMATCH');
    expect(() => executeVehicleOperation({ ...base, operation: 'check_in', plate: 'XYZ999', vehicle: outsideVehicle })).toThrow('PLATE_MISMATCH');
  });

  it('distinguishes vehicle operation replay from fingerprint conflict', () => {
    expect(decideVehicleOperationIdempotency(existing, 'vehicle-op-1', 'vehicle.check_in', fingerprint)).toMatchObject({ kind: 'replay' });
    expect(decideVehicleOperationIdempotency(existing, 'vehicle-op-1', 'vehicle.check_in', 'b'.repeat(64))).toEqual({ kind: 'conflict' });
    expect(decideVehicleOperationIdempotency(null, 'vehicle-op-1', 'vehicle.check_in', fingerprint)).toEqual({ kind: 'new' });
  });
});
