/**
 * activityLogWriter — shared helper for writing activity_logs entries with the
 * 30-day TTL contract (PR #832, 2026-11-23).
 *
 * The activity_logs collection is a ROLLING 30-DAY WINDOW used by:
 *   - the garage dashboard's "today's transactions" list (live listener)
 *   - the admin daily-report modal (one-day pagination + CSV export)
 *
 * Long-term aggregates (counts, revenue, per-staff breakdowns) live in
 * garages/{garageId}/daily_stats/{dateId}, which is NOT TTL'd — those are
 * permanent historical records.
 *
 * Growth math at the owner's stated scale (700 garages × 1,000 cars/day):
 *   - ~700,000 check-outs/day → up to 700K activity_logs docs/day
 *   - 30-day rolling window → ~21M docs steady-state
 *   - storage: ~3-5 GB steady-state (activity_logs entries are ~500-800 bytes)
 *   - reads: every report query is bounded to ONE DAY + a LIMIT (≤1000),
 *     so reads grow with report-open frequency, not log count
 *
 * Without TTL, activity_logs grows forever (~100 GB/year at this scale) and
 * historical-day report reads drift toward expensive full scans. The TTL
 * policy on the `expireAt` field auto-deletes entries older than 30 days,
 * bounding storage at the steady-state ~5 GB.
 *
 * CONTRACT:
 *   - Every activity_logs write MUST go through `buildActivityLogEntry()`.
 *   - The TTL field is named `expireAt` and is a Firestore Timestamp (Date).
 *   - The TTL policy on this collection is configured via the one-time
 *     `gcloud firestore fields ttls update` command (see docs/PROJECT.md).
 *   - Entries that must NOT expire (audit logs for legal/finance records)
 *     should live in a different collection. activity_logs is for live +
 *     recent operational visibility only.
 */

// Activity log entries are kept for 30 days. The TTL policy on the
// `expireAt` field deletes them automatically after that window.
export const ACTIVITY_LOG_TTL_DAYS = 30;
export const ACTIVITY_LOG_TTL_MS = ACTIVITY_LOG_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Build an activity_logs entry with the `expireAt` TTL field attached.
 *
 * Pass the caller's payload (garageId, actionType, timestamp, etc.) — the
 * helper adds `expireAt` automatically. The returned object is ready to be
 * passed to `transaction.set(ref, ...)` or `adminDb.doc(...).set(...)`.
 *
 * The `expireAt` value is `timestamp + 30 days` (uses the entry's own
 * timestamp, NOT Date.now(), so backdated writes get the correct TTL).
 * If the payload has no `timestamp`, falls back to Date.now() so the entry
 * still gets a valid TTL (the Firestore write itself will use the same
 * `new Date()` it would have used anyway).
 */
export function buildActivityLogEntry(payload: Record<string, any>): Record<string, any> {
  const baseMs = extractMs(payload.timestamp) ?? Date.now();
  const expireAt = new Date(baseMs + ACTIVITY_LOG_TTL_MS);
  return { ...payload, expireAt };
}

/**
 * Get the expireAt value for a given timestamp (for tests).
 */
export function activityLogExpireAt(timestamp: Date | { toDate: () => Date } | { toMillis: () => number } | number | undefined | null): Date {
  const ms = extractMs(timestamp) ?? Date.now();
  return new Date(ms + ACTIVITY_LOG_TTL_MS);
}

function extractMs(timestamp: unknown): number | null {
  if (timestamp == null) return null;
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'object') {
    const t = timestamp as any;
    if (typeof t.toDate === 'function') {
      const d = t.toDate();
      return d instanceof Date ? d.getTime() : null;
    }
    if (typeof t.toMillis === 'function' && typeof t.toMillis() === 'number') {
      return t.toMillis();
    }
  }
  return null;
}
