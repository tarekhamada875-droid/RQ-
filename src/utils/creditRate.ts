/**
 * Shared credit-rate helpers — single source of truth for the preset list,
 * the EGP-per-credit ↔ credits-per-EGP conversions, and the display
 * formatting.
 *
 * Units (owner-facing vs storage):
 *   - The admin UI always speaks EGP-per-credit ("كم جنيه يدفع الجراج مقابل
 *     رصيد واحد؟") — presets like 0.5 / 0.65 / 0.75.
 *   - Storage (system_config/global.creditRate and garages/*.creditRateOverride)
 *     speaks credits-per-EGP — the mathematical inverse — because the grant
 *     math is `credits = round(paymentAmountEgp × rate)`.
 *
 * Formatting rule (owner decision 2026-11-18): prices are displayed with at
 * most 2 decimals, trailing zeros stripped ("0.75", "0.5", "1"). The raw
 * inverse of a stored rate can be a long float (e.g. 1/1.33 =
 * 0.7518796992481203) — it must NEVER be rendered as-is.
 */

export const CREDIT_RATE_PRESETS: readonly number[] = [0.5, 0.65, 0.75, 0.8, 1, 2, 10];

/** The preview amount shown under every preset ("100 ج.م ← X رصيد"). */
export const RATE_PREVIEW_EGP = 100;

function toPositiveRate(value: number | undefined | null, fallback: number): number {
  const r = Number(value ?? fallback);
  if (!Number.isFinite(r) || r <= 0) return fallback;
  return r;
}

/** EGP-per-credit → credits-per-EGP (storage unit). Inverse of the input. */
export function egpPerCreditToRate(egpPerCredit: number): number {
  return 1 / toPositiveRate(egpPerCredit, 1);
}

/** credits-per-EGP (storage unit) → EGP-per-credit (display unit). */
export function rateToEgpPerCredit(creditRate: number | undefined | null): number {
  return 1 / toPositiveRate(creditRate, 1);
}

/** How many credits `egp` buys at `egpPerCredit` (same rounding as the server). */
export function creditsForEgp(egpPerCredit: number, egp: number): number {
  if (!(egpPerCredit > 0)) return 0;
  return Math.round(egp / egpPerCredit);
}

/**
 * Display an EGP-per-credit price with at most 2 decimals, trailing zeros
 * stripped. Examples: 0.7518796992481203 → "0.75", 0.5 → "0.5", 1 → "1",
 * 2 → "2". Non-finite/zero input falls back to "1" (the legacy default).
 */
export function formatEgpPerCredit(egpPerCredit: number | undefined | null): string {
  const value = toPositiveRate(egpPerCredit, 1);
  return Number(value.toFixed(2)).toString();
}
