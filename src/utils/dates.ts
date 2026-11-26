import { Timestamp } from 'firebase/firestore';

/**
 * Date / timestamp helpers shared across the client.
 */

export const safeDate = (date: any): Date => {
  if (!date) return new Date();
  if (date instanceof Date) {
    return isNaN(date.getTime()) || date.getTime() < 31536000000 ? new Date() : date;
  }
  if (typeof Timestamp === 'function' && date instanceof Timestamp) return date.toDate();
  if (typeof date?.toDate === 'function') return date.toDate();

  // Handle Firestore internal object structure if passed directly
  if (typeof date === 'object' && typeof date.seconds === 'number') {
    const millis = date.seconds * 1000 + Math.floor((date.nanoseconds || 0) / 1000000);
    return isNaN(millis) || millis < 31536000000 ? new Date() : new Date(millis);
  }

  const d = new Date(date);
  // Specifically check for epoch (0) or invalid dates
  if (isNaN(d.getTime()) || d.getTime() < 31536000000) { // If before 1971, treat as 'now'
    return new Date();
  }
  return d;
};

const getGarageTimestamp = (g: any): number => {
  if (!g || !g.createdAt) return 0;
  const d = safeDate(g.createdAt);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

export const sortGaragesNewestFirst = <T extends { createdAt?: any }>(garages: T[]): T[] => {
  if (!Array.isArray(garages)) return [];
  return [...garages].sort((a, b) => getGarageTimestamp(b) - getGarageTimestamp(a));
};

/**
 * Arabic pluralization helper.
 *
 * Audit ref: Phase 5 / N20 (consolidated audit, 2026-11-06).
 *
 * Arabic grammar requires different noun forms based on the count:
 *   1        → singular (يوم)
 *   2        → dual (يومان)
 *   3–10     → plural (أيام، ساعات، دقائق)
 *   11+      → singular with the counted noun (11 يوم، 21 يوم)
 *
 * The previous getDuration always used the singular form regardless of
 * count — e.g. "3 يوم" instead of "3 أيام". This was visibly incorrect
 * Arabic to native speakers, undermining trust in a financial UI.
 */
function arabicPlural(n: number, singular: string, dual: string, plural: string): string {
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return plural;
  return singular; // 11+ uses singular form
}

const AR_DAY = (n: number) => arabicPlural(n, 'يوم', 'يومان', 'أيام');

// Used by CheckOutModal for Arabic day pluralization on past-vehicle rows.
export { AR_DAY };

const arTimeFormatter = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', minute: '2-digit' });
const arWeekdayFormatter = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' });
const arDayMonthFormatter = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' });

export const formatEntryTimeParts = (entryTime: any, referenceNow?: Date) => {
  const date = safeDate(entryTime);
  const now = referenceNow || new Date();

  const dMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffDays = Math.round((nowMidnight.getTime() - dMidnight.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = arTimeFormatter.format(date);
  const dayName = arWeekdayFormatter.format(date);
  const dayMonth = arDayMonthFormatter.format(date);

  if (diffDays === 0) {
    return { main: timeStr, sub: null, isToday: true };
  } else if (diffDays === 1) {
    return { main: timeStr, sub: `امبارح ${dayName}`, sub2: dayMonth, isYesterday: true };
  } else {
    return { main: timeStr, sub: dayName, sub2: dayMonth, isPast: true };
  }
};

/**
 * Parse a `YYYY-MM-DD` date key into a local Date (midnight).
 *
 * Audit F-7 (Phase 3, 2026-11-26): this parser previously existed as three
 * private copies across the subscriber screens. Two copies fell back to
 * `safeDate` on invalid input; the third (`useSubscriberForm`) fell back to
 * the raw `new Date(dateKey)` constructor, which returns Invalid Date for bad
 * strings instead of "now". That drift meant the same bad subscriber expiry
 * value could produce a different expiry status on the edit screen vs. the
 * list/renew screens. One shared parser with the shared `safeDate` fallback
 * closes the gap permanently.
 *
 * - Empty / falsy input → `new Date()` (now), matching the originals.
 * - A 10-char `YYYY-MM-DD` string with `-` at positions 4 and 7 →
 *   `new Date(y, m-1, d)` (local midnight).
 * - Anything else → `safeDate(dateKey)` (the shared defensive fallback).
 */
export const parseDateKey = (dateKey: string | any): Date => {
  if (!dateKey) return new Date();
  if (typeof dateKey === 'string' && dateKey.length === 10 && dateKey[4] === '-' && dateKey[7] === '-') {
    const y = parseInt(dateKey.substring(0, 4), 10);
    const m = parseInt(dateKey.substring(5, 7), 10);
    const d = parseInt(dateKey.substring(8, 10), 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m - 1, d);
    }
  }
  return safeDate(dateKey);
};

/**
 * Format a Date into a `YYYY-MM-DD` date key (local time).
 *
 * Audit F-7 (Phase 3, 2026-11-26): co-located with `parseDateKey` so the
 * key format has exactly one definition. Previously duplicated in
 * `SubscriberRenewModal` and `useSubscriberForm`.
 */
export const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
