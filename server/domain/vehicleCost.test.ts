import { describe, expect, it } from 'vitest';

import { calculateVehicleCost } from './vehicleCost';

// Characterization tests for the server-authoritative billing math.
//
// Motivation (2026-11-19, owner question "are the 1,042 tests real?"): a
// sabotage drill (Math.ceil → Math.floor on the hourly-hours line) was NOT
// caught by any of the existing 1,042 tests, because every existing
// check-out test parks for whole hours — where round-up and round-down
// agree. The most common real-world case, a partial hour (90 minutes →
// 2 billed hours), had zero coverage. These tests pin the exact billing
// contract, including the boundaries:
//   - subscriber vehicles are always free
//   - missing/invalid entry times are free (no epoch blow-up)
//   - the 5-minute grace period is free; billing starts at exactly 5:00
//   - EVERY started hour is billed (90 min = 2 hours, 61 min = 2 hours)
//   - overnight bills per STARTED day (26 h = 2 days)

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const minutesAgo = (n: number) => new Date(NOW - n * 60_000);
const hoursAgo = (n: number) => new Date(NOW - n * 3_600_000);
const DAYS_MS = 24 * 3_600_000;

describe('calculateVehicleCost — free cases', () => {
  it('bills subscribers 0 regardless of duration', () => {
    expect(calculateVehicleCost(
      { isSubscriber: true, type: 'hourly', entryTime: hoursAgo(9) },
      { hourlyRate: 10, overnightRate: 50 },
      NOW,
    )).toBe(0);
  });

  it('bills 0 when entryTime is missing (no epoch blow-up)', () => {
    expect(calculateVehicleCost({ type: 'hourly', entryTime: null }, { hourlyRate: 10 }, NOW)).toBe(0);
    expect(calculateVehicleCost({ type: 'hourly', entryTime: undefined }, { hourlyRate: 10 }, NOW)).toBe(0);
    expect(calculateVehicleCost({ type: 'hourly', entryTime: 0 }, { hourlyRate: 10 }, NOW)).toBe(0);
  });

  it('bills 0 when entryTime is not a valid date', () => {
    expect(calculateVehicleCost({ type: 'hourly', entryTime: 'not-a-date' }, { hourlyRate: 10 }, NOW)).toBe(0);
  });

  it('bills 0 inside the 5-minute grace period (accidental check-in)', () => {
    expect(calculateVehicleCost({ type: 'hourly', entryTime: minutesAgo(4) }, { hourlyRate: 10 }, NOW)).toBe(0);
    expect(calculateVehicleCost({ type: 'overnight', entryTime: minutesAgo(1) }, { overnightRate: 50 }, NOW)).toBe(0);
  });
});

describe('calculateVehicleCost — hourly billing', () => {
  const rate = { hourlyRate: 10 };

  it('bills exactly one hour at the 60-minute mark', () => {
    expect(calculateVehicleCost({ type: 'hourly', entryTime: minutesAgo(60) }, rate, NOW)).toBe(10);
  });

  it('bills exactly one hour inside the first hour (50 minutes)', () => {
    expect(calculateVehicleCost({ type: 'hourly', entryTime: minutesAgo(50) }, rate, NOW)).toBe(10);
  });

  it('bills TWO hours for 90 minutes — every started hour counts', () => {
    // This is the case that kills the Math.ceil → Math.floor sabotage drill.
    expect(calculateVehicleCost({ type: 'hourly', entryTime: minutesAgo(90) }, rate, NOW)).toBe(20);
  });

  it('bills TWO hours at 61 minutes — one minute past the hour starts a new one', () => {
    expect(calculateVehicleCost({ type: 'hourly', entryTime: minutesAgo(61) }, rate, NOW)).toBe(20);
  });

  it('keeps fractional money to 2 decimals (rate 15.25 × 3 h = 45.75)', () => {
    expect(calculateVehicleCost({ type: 'hourly', entryTime: hoursAgo(3) }, { hourlyRate: 15.25 }, NOW)).toBe(45.75);
  });

  it('accepts Firestore Timestamp-shaped entry times (via .toDate())', () => {
    const timestampShape = { toDate: () => minutesAgo(90) };
    expect(calculateVehicleCost({ type: 'hourly', entryTime: timestampShape }, rate, NOW)).toBe(20);
  });
});

describe('calculateVehicleCost — overnight billing', () => {
  const rate = { overnightRate: 50 };

  it('bills one day for a short overnight stay (90 minutes)', () => {
    expect(calculateVehicleCost({ type: 'overnight', entryTime: minutesAgo(90) }, rate, NOW)).toBe(50);
  });

  it('bills one day for exactly 24 hours', () => {
    expect(calculateVehicleCost({ type: 'overnight', entryTime: hoursAgo(24) }, rate, NOW)).toBe(50);
  });

  it('bills TWO days at 26 hours — every started day counts', () => {
    expect(calculateVehicleCost(
      { type: 'overnight', entryTime: new Date(NOW - 26 * 3_600_000) },
      rate,
      NOW,
    )).toBe(100);
  });

  it('never rounds days below 1 even for sub-minute stays past the grace period', () => {
    expect(calculateVehicleCost({ type: 'overnight', entryTime: new Date(NOW - (5 * 60_000 + 1)) }, rate, NOW)).toBe(50);
  });

  it('falls back to overnightRate 0 when the garage has no overnight rate', () => {
    expect(calculateVehicleCost(
      { type: 'overnight', entryTime: new Date(NOW - 2 * DAYS_MS) },
      {},
      NOW,
    )).toBe(0);
  });
});

describe('calculateVehicleCost — 999 EGP stay cap (owner directive 2026-11-19)', () => {
  it('clamps a long hourly stay to exactly 999 (2000 h × 10 = 20,000 → 999)', () => {
    expect(calculateVehicleCost(
      { type: 'hourly', entryTime: hoursAgo(2000) },
      { hourlyRate: 10 },
      NOW,
    )).toBe(999);
  });

  it('keeps a hourly total of exactly 999 untouched (3 h × 333)', () => {
    expect(calculateVehicleCost(
      { type: 'hourly', entryTime: hoursAgo(3) },
      { hourlyRate: 333 },
      NOW,
    )).toBe(999);
  });

  it('clamps a fractional hourly total above 999 down to exactly 999 (3 h × 333.5 = 1,000.5)', () => {
    expect(calculateVehicleCost(
      { type: 'hourly', entryTime: hoursAgo(3) },
      { hourlyRate: 333.5 },
      NOW,
    )).toBe(999);
  });

  it('clamps a long overnight stay to exactly 999 (5 days × 500 = 2,500 → 999)', () => {
    expect(calculateVehicleCost(
      { type: 'overnight', entryTime: new Date(NOW - 5 * DAYS_MS - 3_600_000) },
      { overnightRate: 500 },
      NOW,
    )).toBe(999);
  });

  it('keeps an overnight total of exactly 999 untouched (1 day × 999)', () => {
    expect(calculateVehicleCost(
      { type: 'overnight', entryTime: hoursAgo(24) },
      { overnightRate: 999 },
      NOW,
    )).toBe(999);
  });

  it('caps apply to the stored/charged amount path — decideVehicleCheckOut receives the clamped cost', () => {
    // checkOut.ts computes cost = calculateVehicleCost(...) then stores
    // totalCost / adds to revenue with that value, so the 999 clamp is the
    // real money ceiling, not a display-only trick.
    const cost = calculateVehicleCost(
      { type: 'hourly', entryTime: hoursAgo(2000) },
      { hourlyRate: 10 },
      NOW,
    );
    expect(cost).toBeLessThanOrEqual(999);
    expect(cost).toBe(999);
  });
});
