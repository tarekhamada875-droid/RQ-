import { describe, expect, it } from 'vitest';
import { effectiveDailyCapacity, canAcceptVehicle, isUnlimitedCapacity } from '../domain/capacity.js';
import { commissionForDuration } from '../domain/commission.js';
import { calculatePackagePrice } from '../domain/pricing.js';
import { calculateRefundEffect } from '../domain/refund.js';
import { evaluateTrialEligibility } from '../domain/trial.js';
import { FinancialEventSchema } from '../contracts/entities.js';

describe('v2 domain mathematics', () => {
  it.each([
    [{ kind: 'none' as const }, 10000, 0, 10000],
    [{ kind: 'percentage' as const, value: 20 }, 10000, 2000, 8000],
    [{ kind: 'fixed' as const, valueMinor: 1250 }, 10000, 1250, 8750]
  ])('applies discount before adjustments: %o', (discount, basePriceMinor, expectedDiscountMinor, expectedDiscountedMinor) => {
    const result = calculatePackagePrice({ basePriceMinor, discount, subscriberFeeMinor: 500, referralCommissionMinor: 50 });
    expect(result.discountMinor).toBe(expectedDiscountMinor);
    expect(result.discountedPriceMinor).toBe(expectedDiscountedMinor);
    expect(result.finalPriceMinor).toBe(expectedDiscountedMinor + 550);
  });

  it('rejects discounts larger than the base price', () => {
    expect(() => calculatePackagePrice({ basePriceMinor: 100, discount: { kind: 'fixed', valueMinor: 101 } })).toThrow('Discount exceeds base price');
  });

  it.each([
    [{ isTrial: true, dailyCapacity: 0 }, 100, false],
    [{ isTrial: false, dailyCapacity: 0 }, 0, true],
    [{ isTrial: false, dailyCapacity: 40 }, 40, false]
  ])('applies capacity policy: %o', (input, expectedCapacity, unlimited) => {
    expect(effectiveDailyCapacity(input)).toBe(expectedCapacity);
    expect(isUnlimitedCapacity(input)).toBe(unlimited);
  });

  it('enforces bounded capacity while allowing unlimited capacity', () => {
    expect(canAcceptVehicle({ dailyCapacity: 2, carsInside: 1 })).toBe(true);
    expect(canAcceptVehicle({ dailyCapacity: 2, carsInside: 2 })).toBe(false);
    expect(canAcceptVehicle({ dailyCapacity: 0, carsInside: 999 })).toBe(true);
  });

  it('returns explicit trial reasons and deterministic expiry', () => {
    const now = new Date('2026-09-20T10:00:00.000Z');
    expect(evaluateTrialEligibility({ alreadyUsed: true, durationDays: 2, now })).toEqual({ eligible: false, reason: 'already_used' });
    expect(evaluateTrialEligibility({ alreadyUsed: false, durationDays: 2, now })).toEqual({ eligible: true, reason: 'eligible', endsAt: '2026-09-22T10:00:00.000Z' });
    expect(evaluateTrialEligibility({ alreadyUsed: false, durationDays: 0, now })).toEqual({ eligible: false, reason: 'invalid_duration' });
  });

  it.each([[1, 10], [7, 20], [15, 40], [30, 80]])('selects commission for %i days', (durationDays, expected) => {
    expect(commissionForDuration(durationDays, { daily: 10, weekly: 20, biweekly: 40, monthly: 80 })).toBe(expected);
  });

  it('creates a compensating financial effect without mutating the source event', () => {
    const event = FinancialEventSchema.parse({
      id: 'event-1', accountId: 'wallet-1', kind: 'debit', amountMinor: 5000,
      idempotencyKey: 'refund-event-1', occurredAt: '2026-09-20T10:00:00.000Z'
    });
    expect(calculateRefundEffect(event, 100)).toEqual({
      reversalKind: 'credit', amountMinor: 5000, sourceEventId: 'event-1', commissionReversalMinor: 100
    });
    expect(event.kind).toBe('debit');
  });
});
