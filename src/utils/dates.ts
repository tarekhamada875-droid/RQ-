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
const AR_HOUR = (n: number) => arabicPlural(n, 'ساعة', 'ساعتان', 'ساعات');
const AR_MINUTE = (n: number) => arabicPlural(n, 'دقيقة', 'دقيقتان', 'دقائق');

// Exported for use in CheckOutModal and other components that display
// Arabic durations with proper pluralization.
export { AR_DAY, AR_HOUR, AR_MINUTE, arabicPlural };

export const getDuration = (entryTime: any, referenceNow?: Date): string => {
  const start = entryTime ? safeDate(entryTime) : new Date();
  const end = referenceNow ? safeDate(referenceNow) : new Date();

  // If entryTime is in the future or very close to end (pending sync)
  if (start.getTime() >= end.getTime() - 2000) return 'الآن';

  const diff = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.floor(diff / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    let result = `${days} ${AR_DAY(days)}`;
    if (hours > 0) result += ` و ${hours} ${AR_HOUR(hours)}`;
    if (minutes > 0) result += ` و ${minutes} ${AR_MINUTE(minutes)}`;
    return result;
  }

  if (totalHours > 0) {
    let result = `${totalHours} ${AR_HOUR(totalHours)}`;
    if (minutes > 0) result += ` و ${minutes} ${AR_MINUTE(minutes)}`;
    return result;
  }
  return `${minutes} ${AR_MINUTE(minutes)}`;
};

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

export const isSessionActive = (lastActive: any, serverTimeOffset: number = 0): boolean => {
  if (!lastActive) return false;
  const lastActiveMillis = safeDate(lastActive).getTime();
  if (isNaN(lastActiveMillis) || lastActiveMillis === 0) return false;
  // If last activity was within 10 minutes (600000ms), session is active
  return Date.now() + serverTimeOffset - lastActiveMillis < 600000;
};
