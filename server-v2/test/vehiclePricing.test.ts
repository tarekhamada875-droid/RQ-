import { describe, expect, it } from 'vitest';
import { calculateVehiclePrice } from '../domain/vehiclePricing.js';

const now = '2026-09-21T12:00:00.000Z';
const input = {
  isSubscriber: false,
  type: 'hourly' as const,
  entryAt: '2026-09-21T10:00:00.000Z',
  hourlyRate: 50,
  overnightRate: 300,
  now
};

describe('vehicle pricing compatibility', () => {
  it('charges subscribers zero', () => {
    expect(calculateVehiclePrice({ ...input, isSubscriber: true })).toMatchObject({ amount: 0, graceApplied: false, currency: 'EGP' });
  });

  it('applies the five-minute grace period', () => {
    expect(calculateVehiclePrice({ ...input, entryAt: '2026-09-21T11:56:00.000Z' })).toMatchObject({ amount: 0, graceApplied: true });
    expect(calculateVehiclePrice({ ...input, entryAt: '2026-09-21T11:55:00.000Z' }).amount).toBe(50);
  });

  it('rounds hourly stays up to the next hour', () => {
    expect(calculateVehiclePrice(input).amount).toBe(100);
    expect(calculateVehiclePrice({ ...input, entryAt: '2026-09-21T11:01:00.000Z' }).amount).toBe(50);
  });

  it('charges overnight stays by whole days', () => {
    expect(calculateVehiclePrice({ ...input, type: 'overnight', entryAt: '2026-09-19T12:00:00.000Z' }).amount).toBe(600);
  });

  it('uses the cheaper multi-day overnight cap when applicable', () => {
    expect(calculateVehiclePrice({ ...input, entryAt: '2026-09-19T00:00:00.000Z' }).amount).toBe(900);
  });

  it('returns zero when rates are absent', () => {
    expect(calculateVehiclePrice({ ...input, hourlyRate: 0, overnightRate: 0 }).amount).toBe(0);
  });
});
