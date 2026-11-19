import { describe, expect, it } from 'vitest';

// Audit P0-2 (owner-approved plan 2026-11-19): both price writers store the
// credits-per-EGP rate rounded to 12 decimals. These tests pin the convention
// and prove it can never shift a grant boundary.

import {
  CREDIT_RATE_STORAGE_DECIMALS,
  roundCreditRateForStorage,
} from './creditRateStorage';

const PRESET_PRICES_EGP_PER_CREDIT = [0.5, 0.65, 0.75, 0.8, 1, 2, 10];

describe('credit rate storage convention', () => {
  it('uses 12 storage decimals', () => {
    expect(CREDIT_RATE_STORAGE_DECIMALS).toBe(12);
  });

  it('canonicalizes float noise from the per-garage inverse', () => {
    expect(roundCreditRateForStorage(1 / 0.65)).toBe(1.538461538462);
    expect(roundCreditRateForStorage(1 / 0.3)).toBe(3.333333333333);
  });

  it('preserves fine-but-legal inputs the old 2-decimal rule distorted', () => {
    // Old global rule: Math.round(0.015 * 100) / 100 === 0.02 (a 33% error).
    expect(roundCreditRateForStorage(0.015)).toBe(0.015);
    expect(roundCreditRateForStorage(0.125)).toBe(0.125);
  });

  it('leaves already-2-decimal values bit-identical (no migration needed)', () => {
    for (const value of [0.01, 0.5, 0.65, 0.75, 0.8, 1, 2, 10, 1000]) {
      expect(roundCreditRateForStorage(value)).toBe(value);
    }
  });

  it('never moves a grant boundary: full parity sweep over presets × amounts', () => {
    // Client preview: Math.round(egp / price).  Server grant: Math.round(egp *
    // storedRate) where storedRate = round12(1 / price). They must agree for
    // every preset and every legal amount 50..2000.
    let checked = 0;
    for (const price of PRESET_PRICES_EGP_PER_CREDIT) {
      const storedRate = roundCreditRateForStorage(1 / price);
      for (let egp = 50; egp <= 2_000; egp += 1) {
        const clientCredits = Math.round(egp / price);
        const serverCredits = Math.round(egp * storedRate);
        expect(serverCredits).toBe(clientCredits);
        checked += 1;
      }
    }
    expect(checked).toBe(7 * 1_951);
  });
});
