/**
 * Delegate commission domain logic — single source of truth.
 *
 * Audit ref: Phase 7 / C10 (consolidated audit, 2026-11-06).
 *
 * Previously, the rolling 30-day commission decision logic was
 * duplicated in creditGrantRoutes.ts AND creditRequestRoutes.ts —
 * both with the same THIRTY_DAYS_MS constant, the same
 * isQualifyingPayment check, the same lastCommissionGrantAt
 * timestamp extraction, and the same isCommissionDue decision.
 *
 * Now there's one pure function that both routes call.
 */

/** 30 days in milliseconds — the rolling window for delegate commission. */
export const COMMISSION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Minimum EGP amount that qualifies for commission. */
export const COMMISSION_QUALIFYING_THRESHOLD_EGP = 500;

/** Commission amount awarded per qualifying grant. */
export const COMMISSION_AMOUNT_EGP = 100;

export interface CommissionDecision {
  /** Whether this payment qualifies for commission (≥ 500 EGP). */
  isQualifyingPayment: boolean;
  /** Whether commission should be awarded now (qualifying + 30-day window elapsed). */
  isCommissionDue: boolean;
  /** The delegate ID that should receive commission, or '' if not due. */
  commissionDelegateId: string;
}

/**
 * Decides whether a delegate commission is due for a given payment amount
 * and garage state. Pure function — no side effects, no I/O.
 *
 * Used by:
 *   - creditGrantRoutes.ts (POST /api/garages/:id/credit-grants)
 *   - creditRequestRoutes.ts (POST /api/admin/credit-requests/:id/approve)
 *
 * @param paymentAmountEgp The EGP amount of the credit grant.
 * @param garageCreatedByDelegateId The delegate who onboarded this garage (or undefined).
 * @param garageLastCommissionGrantAt The timestamp of the last commission grant (Firestore Timestamp, Date, or null).
 * @param now The current time (defaults to Date.now()).
 */
export function decideDelegateCommission(
  paymentAmountEgp: number,
  garageCreatedByDelegateId: string | undefined | null,
  garageLastCommissionGrantAt: any,
  now: number = Date.now(),
): CommissionDecision {
  const isQualifyingPayment = paymentAmountEgp >= COMMISSION_QUALIFYING_THRESHOLD_EGP;

  const lastCommissionMs = garageLastCommissionGrantAt
    ? (typeof garageLastCommissionGrantAt === 'object' && typeof garageLastCommissionGrantAt.toMillis === 'function'
      ? garageLastCommissionGrantAt.toMillis()
      : new Date(garageLastCommissionGrantAt).getTime())
    : null;

  const isCommissionDue = isQualifyingPayment && (
    lastCommissionMs === null ||
    Number.isNaN(lastCommissionMs) ||
    (now - lastCommissionMs) >= COMMISSION_WINDOW_MS
  );

  const commissionDelegateId = isCommissionDue && typeof garageCreatedByDelegateId === 'string'
    ? garageCreatedByDelegateId.trim()
    : '';

  return { isQualifyingPayment, isCommissionDue, commissionDelegateId };
}
