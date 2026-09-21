import { describe, expect, it } from 'vitest';
import { decideVehicleCheckIn } from '../domain/vehicleCheckIn.js';

const input = {
  garageId: 'garage-1', plate: 'ABC123', plateRaw: 'abc-123', type: 'hourly',
  occurredAt: '2026-09-21T10:00:00.000Z', actorUid: 'staff-1', idempotencyKey: 'checkin-0001'
};
const context = {
  garageId: 'garage-1', garageName: 'Main Garage', isLocked: false, isSuspended: false,
  isDeleting: false, subscriptionExpiresAt: '2026-09-22T00:00:00.000Z', dailyCapacity: 50,
  dailyCount: 2, carsInside: 3, isUnlimited: false, fairUseAllowed: true,
  activeSubscriber: false, today: '2026-09-21'
};

describe('vehicle check-in decision', () => {
  it('creates a strict inside vehicle result with deterministic operation ID', () => {
    const result = decideVehicleCheckIn(input, context, null);
    expect(result).toMatchObject({
      operationId: expect.stringMatching(/^vehicle_[a-f0-9]{32}$/),
      carsInside: 4,
      dailyCount: 3,
      dailyCapacity: 50,
      vehicle: {
        id: 'abc-123', garageId: 'garage-1', plate: 'ABC123', status: 'inside',
        entryAt: input.occurredAt, updatedAt: input.occurredAt
      }
    });
    expect(decideVehicleCheckIn(input, context, null).operationId).toBe(result.operationId);
  });

  it.each([
    ['cross-scope', { garageId: 'other' }, 'GARAGE_SCOPE_MISMATCH'],
    ['deleting', { isDeleting: true }, 'GARAGE_DELETION_IN_PROGRESS'],
    ['locked', { isLocked: true }, 'GARAGE_CHECK_IN_LOCKED'],
    ['suspended', { isSuspended: true }, 'GARAGE_CHECK_IN_LOCKED'],
    ['expired', { subscriptionExpiresAt: '2026-09-20T00:00:00.000Z' }, 'SUBSCRIPTION_EXPIRED'],
    ['subscriber', { activeSubscriber: true }, 'MONTHLY_SUBSCRIBER_NOT_CHECKED_IN'],
    ['fair-use', { fairUseAllowed: false }, 'FAIR_USE_LIMIT_REACHED'],
    ['capacity', { dailyCount: 50 }, 'CAPACITY_LIMIT_REACHED']
  ])('rejects %s according to the explicit invariant', (_name, override, error) => {
    expect(() => decideVehicleCheckIn(input, { ...context, ...override }, null)).toThrow(error);
  });

  it('rejects an already-inside vehicle', () => {
    expect(() => decideVehicleCheckIn(input, context, {
      id: 'abc-123', garageId: 'garage-1', plate: 'ABC123', status: 'inside',
      entryAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:00:00.000Z'
    })).toThrow('VEHICLE_ALREADY_INSIDE');
  });

  it('allows unlimited garages without applying the finite capacity check', () => {
    const result = decideVehicleCheckIn(input, { ...context, dailyCapacity: 0, dailyCount: 1000, isUnlimited: true }, null);
    expect(result.dailyCapacity).toBe(0);
    expect(result.dailyCount).toBe(1001);
  });
});
