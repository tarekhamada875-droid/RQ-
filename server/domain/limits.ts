/**
 * server/domain/limits.ts — the single source of business limits.
 *
 * Whole-repo audit P0-1 (owner-approved implementation plan, 2026-11-19):
 * these numbers were duplicated as bare literals across client and server
 * files (grant range in 4 files, correction bound in 2, wallet length in 2,
 * price range in 2). Duplicated knowledge is what drifts apart over time,
 * so every limit now lives here exactly once.
 *
 * The client mirrors the values in src/utils/limits.ts, and
 * server/domain/limits.parity.test.ts asserts the two sides stay equal.
 */

/**
 * Credit grant / delegate credit request amount, in EGP collected from the
 * garage (per-garage pricing, owner decision 2026-11-18). The server
 * converts this amount into credits with the garage's effective price.
 */
export const CREDIT_AMOUNT_MIN_EGP = 50;
export const CREDIT_AMOUNT_MAX_EGP = 2_000;

/**
 * Admin credit correction magnitude bound, applied per direction: the
 * corrections route accepts `min: -MAX, max: +MAX`. The admin UI is
 * deduct-only by design (audit P0-3 documents the asymmetry separately).
 */
export const CREDIT_CORRECTION_MAX_CREDITS = 100_000;

/** Payment wallet number maximum length, in digits. */
export const PAYMENT_WALLET_NUMBER_MAX_LENGTH = 120;

/**
 * Credit price bounds, shared by BOTH price writers. The inputs live in
 * different units on purpose (the global writer takes a credits-per-EGP
 * rate, the per-garage writer takes an EGP-per-credit price) but they
 * validate against the same 0.01..1000 window.
 */
export const CREDIT_PRICE_MIN = 0.01;
export const CREDIT_PRICE_MAX = 1000;
