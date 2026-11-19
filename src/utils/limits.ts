/**
 * src/utils/limits.ts — the client mirror of server/domain/limits.ts.
 *
 * Whole-repo audit P0-1 (owner-approved implementation plan, 2026-11-19):
 * the client must not re-declare business limits as bare literals. These
 * values are mirrored from the server source of truth, and
 * server/domain/limits.parity.test.ts asserts the two modules stay equal —
 * a one-sided edit fails CI before it can ship.
 */

/**
 * Credit grant / delegate credit request amount, in EGP collected from the
 * garage. The server converts it with the garage's effective price; screens
 * only validate and preview.
 */
export const CREDIT_AMOUNT_MIN_EGP = 50;
export const CREDIT_AMOUNT_MAX_EGP = 2_000;

/** Admin credit correction magnitude bound, applied per direction. */
export const CREDIT_CORRECTION_MAX_CREDITS = 100_000;

/** Payment wallet number maximum length, in digits. */
export const PAYMENT_WALLET_NUMBER_MAX_LENGTH = 120;

/** Credit price bounds (see server/domain/limits.ts for the units note). */
export const CREDIT_PRICE_MIN = 0.01;
export const CREDIT_PRICE_MAX = 1000;
