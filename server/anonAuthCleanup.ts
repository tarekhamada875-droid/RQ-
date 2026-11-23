import { adminAuth } from './firebaseAdmin';
import { getCairoDateKey } from './projections';

/**
 * Nightly anonymous-auth cleanup (Day 2 of the scale-readiness plan,
 * 2026-11-23).
 *
 * The app's auth flow uses Firebase anonymous sign-in (signInAnonymously).
 * Each new device, each cleared storage, each browser reinstall creates a new
 * anonymous uid that is NEVER deleted by the app — Firebase Auth keeps them
 * forever. The owner's debug files showed 9 orphaned uids created over 2 days
 * of normal use; at 700 garages × ~3 devices × ~4 reinstalls/year, that's
 * ~8,400 new uids/year. Small but unbounded.
 *
 * Firebase offers a built-in "automatic clean-up" for anonymous accounts
 * older than 30 days — but ONLY on projects upgraded to Firebase Authentication
 * with Identity Platform. This module is the defense-in-depth equivalent for
 * projects that haven't been upgraded: a nightly cron that lists all auth
 * users via the Identity Toolkit REST API, identifies anonymous ones (empty
 * providerUserInfo + no email + no phone), and deletes those whose
 * lastLoginAt is older than 30 days.
 *
 * Self-gates to a once-a-day Cairo window (04:30–04:34) — different minute
 * from growthCleanup (04:00–04:04) so the two cleanups never collide on the
 * same cron invocation. Bounded: at most MAX_PAGES of 1000 users each.
 *
 * Safety:
 *   - NEVER deletes users with providerUserInfo (real signed-in users).
 *   - NEVER deletes users with email or phoneNumber (real signed-in users).
 *   - NEVER deletes users whose lastLoginAt is less than RETENTION_DAYS old.
 *   - NEVER deletes users whose lastLoginAt is missing (treat as live —
 *     safer than guessing; rare for genuine anonymous accounts anyway).
 *   - Failures never surface from the cron.
 */

const ANON_RETENTION_DAYS = 30;
const ANON_RETENTION_MS = ANON_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_PAGES = 10; // 10 × 1000 = up to 10,000 users scanned per invocation
const MAX_DELETE_BATCH = 100; // deleteUser calls are sequential; cap per invocation

export type AnonCleanupResult = {
  ran: boolean;
  reason?: string;
  scanned: number;
  deleted: number;
  skippedActive: number;
  skippedHasProvider: number;
  skippedUnknown: number;
};

export function isAnonCleanupWindow(now: Date): boolean {
  const { hour, minute } = cairoClockParts(now);
  return hour === 4 && minute >= 30 && minute <= 34;
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

/**
 * Decide whether a single Firebase Auth user record is a stale anonymous
 * account that should be deleted. Pure function — no side effects, safe to
 * unit test in isolation.
 *
 * The Identity Toolkit user record shape:
 *   { localId, email?, phoneNumber?, providerUserInfo?: [{ providerId, ... }],
 *     lastLoginAt?: string (millis since epoch as a STRING), createdAt?: string, ... }
 *
 * Anonymous users: signInAnonymously creates users with NO providerUserInfo
 * (or an empty array) and NO email/phoneNumber. Real users (Google, email,
 * phone, etc.) always have at least one of those.
 *
 * The `lastLoginAt` field is a string of decimal millis. If it's missing we
 * treat the user as live (safer than guessing) — this is rare in practice
 * because Firebase writes it on every sign-in.
 */
export function isStaleAnonymousAccount(user: any, now: Date = new Date()): {
  stale: boolean;
  reason?: string;
} {
  if (!user || typeof user !== 'object') {
    return { stale: false, reason: 'invalid_record' };
  }

  // Has a real auth provider → not anonymous. Keep.
  const providers = Array.isArray(user.providerUserInfo) ? user.providerUserInfo : [];
  if (providers.length > 0) {
    return { stale: false, reason: 'has_provider' };
  }
  // Has email or phone → not anonymous. Keep.
  if (user.email || user.phoneNumber) {
    return { stale: false, reason: 'has_email_or_phone' };
  }

  // No lastLoginAt → can't prove it's stale. Keep (safer).
  if (!user.lastLoginAt) {
    return { stale: false, reason: 'no_last_login' };
  }

  const lastLoginMs = typeof user.lastLoginAt === 'string'
    ? Number.parseInt(user.lastLoginAt, 10)
    : (typeof user.lastLoginAt === 'number' ? user.lastLoginAt : Number.NaN);

  if (!Number.isFinite(lastLoginMs)) {
    return { stale: false, reason: 'invalid_last_login' };
  }

  const ageMs = now.getTime() - lastLoginMs;
  if (ageMs < ANON_RETENTION_MS) {
    return { stale: false, reason: 'too_recent' };
  }

  return { stale: true };
}

export async function runAnonAuthCleanupOncePerDay(now: Date = new Date()): Promise<AnonCleanupResult> {
  const result: AnonCleanupResult = {
    ran: false,
    scanned: 0,
    deleted: 0,
    skippedActive: 0,
    skippedHasProvider: 0,
    skippedUnknown: 0,
  };

  if (!isAnonCleanupWindow(now)) {
    const { hour, minute } = cairoClockParts(now);
    result.reason = `outside_daily_window(cairo ${hour}:${String(minute).padStart(2, '0')})`;
    return result;
  }
  result.ran = true;

  if (!adminAuth || typeof adminAuth.listUsers !== 'function') {
    result.reason = 'adminAuth.listUsers unavailable (REST client not initialized)';
    console.warn('[Worker Cleanup] anon-auth cleanup skipped: listUsers unavailable');
    return result;
  }

  let pageToken: string | undefined;
  let deleteCount = 0;
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await adminAuth.listUsers(1000, pageToken);
      result.scanned += response.users.length;

      for (const user of response.users) {
        const decision = isStaleAnonymousAccount(user, now);
        if (!decision.stale) {
          if (decision.reason === 'has_provider' || decision.reason === 'has_email_or_phone') {
            result.skippedHasProvider += 1;
          } else if (decision.reason === 'too_recent') {
            result.skippedActive += 1;
          } else {
            result.skippedUnknown += 1;
          }
          continue;
        }
        if (deleteCount >= MAX_DELETE_BATCH) {
          // Hit the per-invocation delete cap — leave the rest for tomorrow.
          break;
        }
        try {
          await adminAuth.deleteUser(user.localId);
          result.deleted += 1;
          deleteCount += 1;
        } catch (err: any) {
          // Per-user delete failure must never abort the whole cron run.
          console.warn(`[Worker Cleanup] failed to delete stale anon uid ${user.localId}:`, err?.message || String(err));
        }
      }

      if (deleteCount >= MAX_DELETE_BATCH) break;
      if (!response.nextPageToken) break;
      pageToken = response.nextPageToken;
    }
  } catch (err: any) {
    // Page-list failure must never surface from the cron.
    console.warn('[Worker Cleanup] anon-auth cleanup page-list failed:', err?.message || String(err));
    result.reason = `list_failed: ${String(err?.message || err).slice(0, 100)}`;
  }

  console.log(`[Worker Cleanup] anon-auth cleanup ran for ${getCairoDateKey(now)}: scanned=${result.scanned}, deleted=${result.deleted}, active=${result.skippedActive}, hasProvider=${result.skippedHasProvider}, unknown=${result.skippedUnknown}`);
  return result;
}
