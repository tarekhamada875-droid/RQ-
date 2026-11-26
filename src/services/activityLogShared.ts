/**
 * activityLogShared — the single home for the `activity_logs` query contract.
 *
 * Audit F-6 + F-9 (Phase 3, 2026-11-26): the activity_logs collection is the
 * platform's hottest collection — it absorbs every check-in, check-out,
 * credit grant and refund across the whole fleet. Three client modules
 * (vehicleService, adminActivityService, GarageDailyReportModal) each carried
 * their own copy of the missing-index classifier, their own cap constant, and
 * their own error factory. The caps had already drifted (50 vs 200 — F-6,
 * a user-visible bug where the reports truncation warning could never fire),
 * and the three fallback policies were on their way to drifting next.
 *
 * This module is the one shared home for:
 *   - `TODAY_ACTIVITY_LOG_LIMIT` — the live today-transactions feed cap. The
 *     reports truncation warning reads the SAME constant, so the warning
 *     fires exactly when the feed starts hiding rows (F-6).
 *   - `isMissingActivityLogIndexError(error)` — the single classifier that
 *     decides whether a failed activity_logs query should fall back to the
 *     compatibility shape or surface as a real error (F-9).
 *   - `makeActivityLogUnavailableError(cause)` — the single error type a
 *     caller sees when the live query and its fallback are both unavailable.
 *
 * Each consuming module keeps its own query construction and its own
 * domain-specific fallback filter (e.g. admin's `credit_grant`/شحن/تفعيل
 * filter). What is shared here is the contract that must NOT drift: the cap,
 * the classifier, and the error type.
 *
 * Nothing in this file depends on React or on the Firestore SDK instance, so
 * it is safe to import from any client module or test.
 */

/**
 * The maximum number of activity-log entries the live today-transactions
 * listener will deliver to the UI.
 *
 * This is the SINGLE source of truth for the cap. The reports view's
 * truncation warning (`pickReportsNoticeState`) reads the same constant so
 * that the warning fires the moment the feed could be hiding rows — never
 * earlier, never later. Before F-6, the reports warning used a separate 200
 * constant while the feed capped at 50, so a garage with 60 checkouts today
 * saw a report that silently omitted rows 51–60 with no warning at all.
 */
export const TODAY_ACTIVITY_LOG_LIMIT = 50;

/**
 * Classify whether a Firestore error is the "missing composite index" case
 * that warrants the compatibility fallback query.
 *
 * Firestore raises `failed-precondition` with an index hint in the message
 * when a composite index is missing. Older SDK variants and direct REST
 * failures can surface the same condition as a plain message without the
 * code. Both paths are recognized.
 *
 * Every error that is NOT a missing-index error must surface to the caller
 * (via `makeActivityLogUnavailableError`) rather than silently degrading —
 * that is the F-9 fix for the admin copy that previously treated any error
 * as a missing index.
 */
export function isMissingActivityLogIndexError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return (code === 'failed-precondition' && /index/i.test(message)) ||
    /(?:requires|missing)\s+(?:a\s+|an\s+|the\s+)?(?:composite\s+)?index/i.test(message);
}

/**
 * Build the error surfaced to callers when an activity_logs query and its
 * compatibility fallback are both unavailable. The original cause is
 * preserved on `cause` for diagnostics; the `code` is stable so callers can
 * branch on it without string-matching messages.
 */
export function makeActivityLogUnavailableError(cause: unknown): Error & { code: string } {
  return Object.assign(new Error('ACTIVITY_LOGS_UNAVAILABLE', { cause }), {
    code: 'ACTIVITY_LOGS_UNAVAILABLE'
  });
}
