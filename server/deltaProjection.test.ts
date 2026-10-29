import { describe, expect, it } from 'vitest';
import { createOperationId, nextOperationVersion, createVehicleDelta } from './deltaProjection';

describe('delta projection primitives', () => {
  it('creates stable scoped operation IDs when a client key is supplied', () => {
    expect(createOperationId('garage-1', 'client-42')).toBe('op_garage-1_client-42');
    expect(createOperationId('garage-1', 'client-42')).toBe(createOperationId('garage-1', 'client-42'));
  });

  it('increments only valid non-negative integer operation versions', () => {
    expect(nextOperationVersion(4)).toBe(5);
    expect(nextOperationVersion(undefined)).toBe(1);
    expect(nextOperationVersion('invalid')).toBe(1);
  });

  it('calculates constant-time vehicle deltas', () => {
    expect(createVehicleDelta('vehicle_entered')).toEqual({ activeVehicleCount: 1, entriesToday: 1 });
    expect(createVehicleDelta('vehicle_exited', 125.5)).toEqual({ activeVehicleCount: -1, exitsToday: 1, grossRevenue: 125.5, netRevenue: 125.5 });
    expect(createVehicleDelta('vehicle_refunded', 25)).toEqual({ refundTotal: 25, netRevenue: -25 });
  });

  it.each(['vehicle_exited', 'vehicle_refunded'] as const)('rejects invalid money when creating %s deltas', (eventType) => {
    for (const amount of [-0.01, Number.NaN, Number.POSITIVE_INFINITY, 1.234]) {
      expect(() => createVehicleDelta(eventType, amount)).toThrow('INVALID_MONEY_AMOUNT');
    }
  });
});
