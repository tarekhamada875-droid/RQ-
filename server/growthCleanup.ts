import { adminDb } from './firebaseAdmin';
import { getCairoDateKey } from './projections';

/**
 * Growth cleanup (audit 2026-11-21): two record families were written forever
 * and never deleted —
 *   - idempotency_records/{hash}   (only consulted for 24 h, then dead weight)
 *   - session_index/{...}          (deactivated sessions accumulate forever)
 * Every deleted doc is one fewer doc paying storage and slowing future
 * queries. The cleanup piggybacks on the existing every-minute scheduled cron
 * and self-gates to a once-a-day window (Cairo 04:00–04:05), so the daily
 * cost is a handful of paged batch deletes.
 *
 * Safety:
 *   - idempotency_records: only docs whose expiresAt is >24 h past are
 *     deleted (the 24 h TTL check in idempotency.ts already ignores them).
 *   - session_index: single-field range query on updatedAt (auto-index — no
 *     composite index needed); ONLY docs with isActive !== true are deleted,
 *     and 90-day-old docs are inactive in practice because active sessions
 *     refresh updatedAt on every heartbeat.
 *   - Bounded: at most MAX_PAGES pages of BATCH_SIZE docs per invocation.
 */

const IDEMPOTENCY_RETENTION_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000; // delete ≥24 h after logical expiry
const SESSION_INDEX_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const BATCH_SIZE = 450;
const MAX_PAGES_PER_FAMILY = 4;

export type GrowthCleanupResult = {
  ran: boolean;
  reason?: string;
  idempotencyDeleted: number;
  sessionIndexDeleted: number;
};

export function isGrowthCleanupWindow(now: Date): boolean {
  const { hour, minute } = cairoClockParts(now);
  return hour === 4 && minute <= 4;
}

function cairoClockParts(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(now);
  const [hour, minute] = parts.split(':').map((value) => Number.parseInt(value, 10));
  return { hour: Number.isFinite(hour) ? hour : -1, minute: Number.isFinite(minute) ? minute : -1 };
}

export async function runGrowthCleanupOncePerDay(now: Date = new Date()): Promise<GrowthCleanupResult> {
  const result: GrowthCleanupResult = { ran: false, idempotencyDeleted: 0, sessionIndexDeleted: 0 };

  // Self-gate: the cron fires every minute; only act in the 04:00–04:04 Cairo
  // window (≈5 invocations/day, all idempotent page deletes).
  if (!isGrowthCleanupWindow(now)) {
    const { hour, minute } = cairoClockParts(now);
    result.reason = `outside_daily_window(cairo ${hour}:${String(minute).padStart(2, '0')})`;
    return result;
  }
  result.ran = true;

  // ── idempotency_records ─────────────────────────────────────────────
  const idempotencyCutoff = new Date(now.getTime() - IDEMPOTENCY_RETENTION_AFTER_EXPIRY_MS);
  for (let page = 0; page < MAX_PAGES_PER_FAMILY; page += 1) {
    const snap = await adminDb.collection('idempotency_records')
      .where('expiresAt', '<', idempotencyCutoff)
      .limit(BATCH_SIZE)
      .get();
    if (snap.empty || snap.docs.length === 0) break;
    const batch = adminDb.batch();
    for (const doc of snap.docs) batch.delete(doc.ref || adminDb.doc(`idempotency_records/${doc.id}`));
    await batch.commit();
    result.idempotencyDeleted += snap.docs.length;
    if (snap.docs.length < BATCH_SIZE) break;
  }

  // ── session_index ───────────────────────────────────────────────────
  const sessionCutoff = new Date(now.getTime() - SESSION_INDEX_RETENTION_MS);
  for (let page = 0; page < MAX_PAGES_PER_FAMILY; page += 1) {
    // Single-field range query (automatic index); the isActive filter is
    // applied client-side so no composite index is required.
    const snap = await adminDb.collection('session_index')
      .where('updatedAt', '<', sessionCutoff)
      .limit(BATCH_SIZE)
      .get();
    if (snap.empty || snap.docs.length === 0) break;
    const batch = adminDb.batch();
    let deleted = 0;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (data.isActive === true) continue; // never touch live sessions
      batch.delete(doc.ref || adminDb.doc(`session_index/${doc.id}`));
      deleted += 1;
    }
    if (deleted > 0) await batch.commit();
    result.sessionIndexDeleted += deleted;
    if (snap.docs.length < BATCH_SIZE) break;
  }

  // Day key logged so operators can correlate cleanup volume with days.
  console.log(`[Worker Cleanup] growth cleanup ran for ${getCairoDateKey(now)}: idempotency=${result.idempotencyDeleted}, sessionIndex=${result.sessionIndexDeleted}`);
  return result;
}
