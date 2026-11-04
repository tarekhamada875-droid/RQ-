import { safeDate } from './dates';

/**
 * Business-rule helpers that don't fit a more specific domain module.
 */

/**
 * Business Rule: Garage rates (hourly / overnight) can only be modified once every 30 days.
 */
export const canChangeGarageRates = (garage: any): { allowed: boolean; daysRemaining: number; nextAllowedDate: Date | null } => {
  if (!garage?.lastRateChangeDate) {
    return { allowed: true, daysRemaining: 0, nextAllowedDate: null };
  }

  const lastChange = safeDate(garage.lastRateChangeDate);
  if (isNaN(lastChange.getTime())) {
    return { allowed: true, daysRemaining: 0, nextAllowedDate: null };
  }

  const now = Date.now();
  const diffMs = now - lastChange.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  if (diffMs < thirtyDaysMs) {
    const remainingMs = thirtyDaysMs - diffMs;
    const daysRemaining = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    const nextAllowedDate = new Date(lastChange.getTime() + thirtyDaysMs);
    return { allowed: false, daysRemaining: Math.max(1, daysRemaining), nextAllowedDate };
  }

  return { allowed: true, daysRemaining: 0, nextAllowedDate: null };
};
