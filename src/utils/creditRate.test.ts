import { describe, it, expect } from 'vitest';
import {
  CREDIT_RATE_PRESETS,
  creditsForEgp,
  rateToEgpPerCredit,
  egpPerCreditToRate,
  formatEgpPerCredit,
} from './creditRate';

describe('creditRate utils', () => {
  describe('formatEgpPerCredit — long floats must never leak into the UI (owner decision 2026-11-18)', () => {
    it('formats the raw inverse of the legacy custom rate (1/1.33) as 0.75', () => {
      expect(formatEgpPerCredit(1 / 1.33)).toBe('0.75');
      expect(formatEgpPerCredit(0.7518796992481203)).toBe('0.75');
    });

    it('formats every preset without inventing trailing zeros', () => {
      expect(formatEgpPerCredit(0.5)).toBe('0.5');
      expect(formatEgpPerCredit(0.65)).toBe('0.65');
      expect(formatEgpPerCredit(0.75)).toBe('0.75');
      expect(formatEgpPerCredit(0.8)).toBe('0.8');
      expect(formatEgpPerCredit(1)).toBe('1');
      expect(formatEgpPerCredit(2)).toBe('2');
      expect(formatEgpPerCredit(10)).toBe('10');
    });

    it('falls back to the legacy default (1) for missing or invalid input', () => {
      expect(formatEgpPerCredit(undefined)).toBe('1');
      expect(formatEgpPerCredit(null)).toBe('1');
      expect(formatEgpPerCredit(0)).toBe('1');
      expect(formatEgpPerCredit(-3)).toBe('1');
      expect(formatEgpPerCredit(Number.NaN)).toBe('1');
    });
  });

  describe('conversions', () => {
    it('round-trips EGP-per-credit through the storage unit exactly enough for presets', () => {
      for (const preset of CREDIT_RATE_PRESETS) {
        expect(rateToEgpPerCredit(egpPerCreditToRate(preset))).toBeCloseTo(preset, 12);
      }
    });

    it('treats missing/invalid stored rates as the legacy default 1 EGP/credit', () => {
      expect(rateToEgpPerCredit(undefined)).toBe(1);
      expect(rateToEgpPerCredit(0)).toBe(1);
      expect(egpPerCreditToRate(0)).toBe(1);
    });
  });

  describe('creditsForEgp — mirrors the server grant rounding (round, may add 1 credit)', () => {
    it('matches the preset previews', () => {
      expect(creditsForEgp(0.5, 100)).toBe(200);
      expect(creditsForEgp(0.65, 100)).toBe(154);
      expect(creditsForEgp(0.75, 100)).toBe(133);
      expect(creditsForEgp(1, 100)).toBe(100);
    });

    it('returns 0 for invalid prices instead of Infinity', () => {
      expect(creditsForEgp(0, 100)).toBe(0);
      expect(creditsForEgp(-1, 100)).toBe(0);
    });
  });
});
