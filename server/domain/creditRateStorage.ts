/**
 * Storage convention for credit rates (whole-repo audit P0-2, owner-approved
 * implementation plan 2026-11-19): BOTH price writers — the global
 * system_config/global.creditRate and the per-garage
 * garages/{id}.creditRateOverride — store a credits-per-EGP rate rounded to
 * the same precision.
 *
 * Why 12 decimals:
 * - It preserves every realistic admin input exactly. The old rule rounded
 *   the GLOBAL rate to 2 decimals, which silently distorted fine-but-legal
 *   inputs (a 0.015 rate became 0.02 — a 33% grant error). The per-garage
 *   writer stored the raw float `1 / egpPerCredit` with full binary noise.
 * - It canonicalizes that float noise: 1/0.65 = 1.5384615384615385 is stored
 *   as 1.538461538462.
 * - Values already stored at ≤ 2 decimals are bit-identical under this rule,
 *   so no data migration is needed.
 * - Grant math rounds to whole credits and display rounds to 2 decimals
 *   (rateToEgpPerCredit), so a ≤ 1e-12 relative storage shift can never move
 *   a grant boundary. server/domain/creditRateStorage.test.ts pins this with
 *   a full parity sweep over all presets and every legal amount.
 */
export const CREDIT_RATE_STORAGE_DECIMALS = 12;

/** Round a credits-per-EGP rate to the documented storage precision. */
export function roundCreditRateForStorage(rate: number): number {
  const factor = 10 ** CREDIT_RATE_STORAGE_DECIMALS;
  return Math.round(rate * factor) / factor;
}
