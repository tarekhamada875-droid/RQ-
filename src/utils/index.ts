import { isSubscriptionExpired as checkExpired, isUnlimitedCapacity as checkUnlimited } from "../domain/garage/subscription";
import { getCleanPackageInfo } from '../constants/packages';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0


 */

import { Timestamp } from 'firebase/firestore';

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

export const normalizeDigits = (val: string): string => {
  if (!val) return '';
  return val.replace(/[\u0660-\u0669\u06F0-\u06F9٫]/g, (char) => {
    if (char === '٫') return '.';
    const code = char.charCodeAt(0);
    if (code >= 1632 && code <= 1641) return String(code - 1632);
    if (code >= 1776 && code <= 1785) return String(code - 1776);
    return char;
  });
};

export const normalizeLetters = (val: string): string => {
  if (!val) return '';
  // Force any Alef variation to be Alef with Hamza (أ) as per Egyptian plate standard
  // Also normalize Yeh (ى) to (ي) to treat them as the same as requested
  return val.replace(/[اإآى]/g, m => (m === 'ى' ? 'ي' : 'أ'));
};

/**
 * Normalizes Arabic text for flexible and resilient searching.
 * Treats Alef variations as identical, Heh/Teh Marbuta as identical, and Yeh/Alef Maksura as identical.
 */
export const normalizeArabicSearch = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[أإآاةهىي]/g, m => {
      if (m === 'ة' || m === 'ه') return 'ه';
      if (m === 'ى' || m === 'ي') return 'ي';
      return 'ا';
    })
    .trim();
};

export const getCleanPlate = (val: string): string => {
  if (!val) return '';
  let letters = '';
  let numbers = '';
  
  const normalized = normalizeLetters(val);
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    // Numbers (English, Arabic, Persian)
    if ((char >= '0' && char <= '9') || (char >= '\u0660' && char <= '\u0669') || (char >= '\u06F0' && char <= '\u06F9')) {
      if (numbers.length < 4) numbers += char;
    } 
    // Arabic Letters Only (Range \u0621-\u064A covers basic letters and hamzas)
    else if (char >= '\u0621' && char <= '\u064A') {
      if (letters.length < 4) letters += char;
    }
  }
  return letters + numbers;
};

export const getRawPlate = (val: string): string => {
  if (!val) return '';
  let letters = '';
  let numbers = '';
  
  const normalized = normalizeLetters(normalizeDigits(val));
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char >= '0' && char <= '9') {
      if (numbers.length < 4) numbers += char;
    } else if (char >= '\u0621' && char <= '\u064A') {
      if (letters.length < 4) letters += char;
    }
  }
  return letters + numbers;
};

export interface PlateParts {
  letters: string;
  numbers: string;
}

/**
 * Splits a plate number into its distinct letter and number segments.
 */
export const getPlateParts = (val: string): PlateParts => {
  const raw = getRawPlate(val);
  const letters = raw.replace(/[0-9]/g, '');
  const numbers = raw.replace(/[^0-9]/g, '');
  return { letters, numbers };
};

/**
 * Validates whether a plate has at least 1 letter and 1 number.
 */
export const isPlateValid = (val: string): boolean => {
  const { letters, numbers } = getPlateParts(val);
  return letters.length >= 1 && numbers.length >= 1;
};

/**
 * Formats plate letters with standard spacing.
 */
export const formatPlateLetters = (letters: string): string => {
  return letters.split('').join(' ');
};

export const normalizePhone = (phone: string): string => {
  return normalizeDigits(phone.trim()).replace(/[^\d+]/g, '');
};

export const formatPlateNumber = (val: string): string => {
  if (!val) return '';
  
  const letters: string[] = [];
  let numbers = '';
  
  const normalized = normalizeLetters(val);
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if ((char >= '0' && char <= '9') || (char >= '\u0660' && char <= '\u0669') || (char >= '\u06F0' && char <= '\u06F9')) {
      if (numbers.length < 4) numbers += char;
    } else if (char >= '\u0621' && char <= '\u064A') {
      if (letters.length < 4) letters.push(char);
    }
  }
  
  if (letters.length === 0 && numbers.length === 0) return '';
  // Join letters with spaces, but numbers WITHOUT spaces to prevent RTL reversal of digit order
  return letters.join(' ') + ' : ' + numbers;
};

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
    let result = `${days} يوم`;
    if (hours > 0) result += ` و ${hours} ساعة`;
    if (minutes > 0) result += ` و ${minutes} دقيقة`;
    return result;
  }

  if (totalHours > 0) {
    let result = `${totalHours} ساعة`;
    if (minutes > 0) result += ` و ${minutes} دقيقة`;
    return result;
  }
  return `${minutes} دقيقة`;
};

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;
const GRACE_PERIOD_MS = 300000;

export const calculateCost = (vehicle: any, garage: any, referenceNow?: Date): number => {
  if (!vehicle || !garage) return 0;
  
  // Default to hourly if type is missing (for legacy data in activePlates)
  const type = vehicle.type || 'hourly';
  
  const now = referenceNow || new Date();
  let start = now;
  
  if (vehicle.entryTime) {
    start = safeDate(vehicle.entryTime);
  }

  const diffMs = now.getTime() - start.getTime();

  // If it's been less than 5 minutes, it's FREE (protection against accidental entry error)
  if (diffMs < GRACE_PERIOD_MS) return 0;

  // 0. Subscribers are always FREE at check-out
  if (vehicle.isSubscriber) return 0;

  if (type === 'overnight') {
    const overnightRate = garage.overnightRate || 0;
    const days = Math.ceil(diffMs / MS_PER_DAY);
    const total = Math.max(1, days) * overnightRate;
    return Math.round(total * 100) / 100;
  }
  
  // FALLBACK for old offline vehicles (If everything is missing or returns now)
  // Ensure we charge at least 1 hour if it's hourly, unless it's genuinely new
  if (type === 'hourly' && (diffMs <= 2000)) {
     // If it's old (has an ID but no times found), assume at least one hour
     if (vehicle.id && !vehicle.id.startsWith('temp_')) return garage.hourlyRate || 0;
  }
  
  // If start is somehow still in the future or invalid, cap it at 'now'
  if (start.getTime() > now.getTime()) start = now;
  
  if (type === 'hourly') {
    const hourlyRate = garage.hourlyRate || 0;
    const overnightRate = garage.overnightRate || 0;
    const hours = Math.ceil(diffMs / MS_PER_HOUR);
    let total = Math.max(1, hours) * hourlyRate;

    // Day-Cap Rate Optimization: if stay spans >= 24h and overnight rate is defined, cap multi-day chunks
    if (overnightRate > 0 && diffMs >= MS_PER_DAY) {
      const fullDays = Math.floor(diffMs / MS_PER_DAY);
      const remMs = diffMs % MS_PER_DAY;
      const remHours = Math.ceil(remMs / MS_PER_HOUR);
      const blended = (fullDays * overnightRate) + Math.min(overnightRate, remHours * hourlyRate);
      total = Math.min(total, blended);
    }

    return Math.round(total * 100) / 100;
  }
  return 0;
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

export const getStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;
    if (typeof defaultValue === 'string') return saved as unknown as T;
    if (typeof defaultValue === 'boolean') return (saved === 'true') as unknown as T;
    return JSON.parse(saved);
  } catch (e) {
    return defaultValue;
  }
};

export const NEW_PIN_LENGTH = 8;

/**
 * Generates an eight-digit PIN that is unique against the provided local set.
 * The server remains authoritative for global uniqueness.
 */
export const generateSafePin = (existingPins: Set<string> | string[] = new Set()): string => {
  const pins = existingPins instanceof Set ? existingPins : new Set(existingPins);
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let pin = '';
  let attempts = 0;
  while (attempts < 100) {
    const pool = [...digits];
    let candidate = '';
    for (let i = 0; i < NEW_PIN_LENGTH; i++) {
      const idx = i + Math.floor(Math.random() * (pool.length - i));
      const temp = pool[i];
      pool[i] = pool[idx];
      pool[idx] = temp;
      candidate += pool[i];
    }
    if (!pins.has(candidate)) {
      pin = candidate;
      break;
    }
    attempts++;
  }
  if (!pin) {
    pin = Math.floor(10000000 + Math.random() * 90000000).toString();
  }
  return pin;
};
/**
 * Resolves the application shimmer accent color, always returning Amber Gold (#f59e0b).
 */
export const resolveShimmerColor = (_color?: string, _theme?: 'light' | 'dark'): string => {
  return '#f59e0b';
};

/**
 * Checks if a hex color is "light" (bright), suggesting a dark text color should be used on top of it.
 */
export const isLightColor = (color: string | undefined): boolean => {
  if (!color) return false;
  const c = color.toLowerCase();
  if (c === '#faf9f6' || c === '#f59e0b' || c === '#eab308') {
    return true;
  }
  if (c.startsWith('#') && c.length === 7) {
    const num = parseInt(c.substring(1), 16);
    if (!isNaN(num)) {
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return ((r * 299) + (g * 587) + (b * 114)) > 150000;
    }
  }
  return false;
};

export { 
  isSubscriptionExpired, 
  getRemainingDays, 
  getRemainingSubscriptionInfo,
  type RemainingSubscriptionInfo,
  getEffectiveDailyCapacity,
  isUnlimitedCapacity
} from '../domain/garage/subscription';
export { validateRechargeRequest } from '../domain/garage/validation';

/**
 * Applies the configured monthly-subscribers fixed fee (default 500 EGP).
 * Flat fee comes from system_config/global (monthlySubscribersFlatFee).
 */
export const applyMonthlySubscribersFlatFee = (price: number, hasMonthlySubscribers: boolean, flatFee: number = 500): number => {
  const fee = Number(flatFee) || 500;
  return hasMonthlySubscribers ? price + fee : price;
};

/**
 * Calculates the final display price for a package:
 * 1. Add referralFee for delegate-referred garage (default 30 EGP if referred, 0 otherwise)
 * 2. Apply discount (percentage or fixed) on the base price
 * 3. Apply monthly subscribers flat fee (configured flat amount, default 500 EGP)
 */
export const calculateFinalPrice = (
  pkg: any, 
  hasMonthlySubscribers: boolean = false, 
  flatFee: number = 500,
  referralFee: number | { daily?: number; weekly?: number; biweekly?: number; monthly?: number; [key: string]: number | undefined } = 0
): {
  basePrice: number;
  hasDiscount: boolean;
  discountedPrice: number;
  finalPrice: number;
  totalDiscount: number;
  displayBasePrice: number;
  actualReferralFee: number;
} => {
  if (!pkg) {
    return {
      basePrice: 0,
      hasDiscount: false,
      discountedPrice: 0,
      finalPrice: 0,
      totalDiscount: 0,
      displayBasePrice: 0,
      actualReferralFee: 0,
    };
  }
  const basePrice = pkg.price || 0;
  const durationDays = typeof pkg.durationDays === 'number' ? pkg.durationDays : (packageIdToDays(pkg.id || '', pkg.name) || 30);
  
  let actualReferralFee = 0;
  if (typeof referralFee === 'object' && referralFee !== null) {
    if (durationDays <= 1) {
      actualReferralFee = referralFee.daily !== undefined ? Number(referralFee.daily) : 5;
    } else if (durationDays <= 7) {
      actualReferralFee = referralFee.weekly !== undefined ? Number(referralFee.weekly) : 15;
    } else if (durationDays <= 15) {
      actualReferralFee = referralFee.biweekly !== undefined ? Number(referralFee.biweekly) : 25;
    } else {
      actualReferralFee = referralFee.monthly !== undefined ? Number(referralFee.monthly) : 50;
    }
  } else if (Number(referralFee) > 0) {
    // Number passed directly
    if (durationDays <= 1) {
      actualReferralFee = 5;
    } else if (durationDays <= 7) {
      actualReferralFee = 15;
    } else if (durationDays <= 15) {
      actualReferralFee = 25;
    } else {
      actualReferralFee = Number(referralFee) >= 0 ? Number(referralFee) : 50;
    }
  }
  
  actualReferralFee = Math.max(0, actualReferralFee);
  
  const hasDiscount = !!(pkg.discountValue && pkg.discountValue > 0);
  const discountedPrice = hasDiscount
    ? (pkg.discountType === 'percentage'
        ? Math.round(basePrice * (1 - pkg.discountValue / 100))
        : Math.max(0, basePrice - pkg.discountValue))
    : basePrice;
  const finalPrice = applyMonthlySubscribersFlatFee(discountedPrice, hasMonthlySubscribers, flatFee) + actualReferralFee;
  const displayBasePrice = applyMonthlySubscribersFlatFee(basePrice, hasMonthlySubscribers, flatFee);
  const totalDiscount = displayBasePrice - finalPrice;
  return { basePrice, hasDiscount, discountedPrice, finalPrice, totalDiscount, displayBasePrice, actualReferralFee };
};

/**
 * Converts a subscription package ID to duration in days.
 * Delegates to getCleanPackageInfo as the single source of truth.
 */
export const packageIdToDays = (packageId: string, pkgName?: string): number => {
  return getCleanPackageInfo({ id: packageId, name: pkgName }).durationDays || 30;
};

/**
 * Retries a Firestore/API operation with exponential backoff and network checks.
 * Immediate throw for non-retryable authorization or business rule errors.
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 300
): Promise<T> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('لا يوجد اتصال بالإنترنت. يرجى التأكد من اتصالك بشبكة الإنترنت ثم المحاولة مرة أخرى.');
  }

  const isNonRetryable = (err: any): boolean => {
    if (!err) return false;
    const msg = (err.message || String(err)).toLowerCase();
    const code = (err.code || '').toLowerCase();
    const combined = `${code} ${msg}`;
    return /permission|unauthenticated|unauthorized|invalid-argument|not[-_ ]found|already-exists|locked|expired|validation|reached_daily_deletion_limit|insufficient_balance/.test(combined);
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('انقطع الاتصال بالإنترنت أثناء تنفيذ العملية. يرجى إعادة الاتصال والمحاولة مرة أخرى.');
      }
      if (isNonRetryable(err)) {
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
      }
    }
  }
  throw lastError;
};

/**
 * Simple lock to prevent concurrent execution of the same async operation.
 * Use for check-in/check-out to prevent double-submits.
 */
export const createAsyncLock = () => {
  let isLocked = false;
  return async <T>(fn: () => Promise<T>): Promise<T | null> => {
    if (isLocked) return null; // Already running — ignore this call
    isLocked = true;
    try {
      return await fn();
    } finally {
      isLocked = false;
    }
  };
};

/**
 * Throttles snapshot updates to prevent excessive re-renders and UI thrashing.
 */
export function throttleSnapshot<T>(callback: (data: T) => void, limitMs = 4000) {
  let lastRan = 0;
  let storedData: T | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (incomingData: T) => {
    storedData = incomingData;
    const now = Date.now();

    if (now - lastRan >= limitMs) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      callback(storedData);
      lastRan = now;
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        if (storedData !== null) {
          callback(storedData);
        }
        lastRan = Date.now();
        timeoutId = null;
      }, limitMs - (now - lastRan));
    }
  };
}





export const getPackageRechargeRestrictions = (garage: any, targetPackage: any) => {
  if (!garage || !targetPackage) return { isAllowed: true, reason: '' };

  const targetDays = typeof targetPackage.durationDays === 'number' ? targetPackage.durationDays : packageIdToDays(targetPackage.id, targetPackage.name);

  // Business Rule: If garage has monthly subscribers service enabled, only 30-day packages are allowed
  if (garage.hasMonthlySubscribers && targetDays !== 30) {
    return { 
      isAllowed: false, 
      reason: 'خدمة المشتركين الشهريين مفعلة لهذا الجراج، لذلك يقتصر الشحن على باقات الـ 30 يوم (الشهرية) فقط.' 
    };
  }

  const isExpired = checkExpired(garage);
  const currentPackageName = String(garage.activePackageName || garage.packageName || garage.lastPackageName || '');
  const currentPackageId = garage.activePackageId || garage.packageId || '';
  
  const currentDays = packageIdToDays(currentPackageId, currentPackageName) || 30;
  const currentIsDaily = currentDays <= 2;
  const currentIsUnlimited = checkUnlimited(garage);

  const targetIsDaily = targetDays <= 2;
  
  const targetName = (targetPackage.name || '').toLowerCase();
  const targetIsUnlimited = targetPackage.dailyCapacity === 0 || targetName.includes('مفتوح') || targetName.includes('غير محدود') || targetName.includes('بدون حد') || targetName.includes('تجريبي');

  if (!isExpired && currentIsUnlimited && !targetIsUnlimited) {
    return { isAllowed: false, reason: 'لا يمكن شحن باقة محدودة لأن الجراج يعمل حالياً بباقة غير محدودة سارية.' };
  }

  if (!isExpired && !currentIsDaily && targetIsDaily) {
    return { isAllowed: false, reason: 'لا يمكن شحن باقة يومية لأن الجراج يمتلك باقة طويلة سارية.' };
  }

  return { isAllowed: true, reason: '' };
};

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

/**
 * Detects whether a PIN string is a cryptographic hash (scrypt, sha256, etc.) rather than a plain PIN.
 */
export const isHashedPin = (pin: string | undefined | null): boolean => {
  if (!pin) return false;
  const str = String(pin).trim();
  if (str.length > 12) return true;
  return str.startsWith('$') || str.startsWith('!$') || str.startsWith('scrypt');
};

/**
 * Formats plain text or hashed PINs for clean UI display without breaking layouts.
 */
export const formatDisplayPin = (pin: string | undefined | null): string => {
  if (!pin) return '—';
  const str = String(pin).trim();
  if (isHashedPin(str)) {
    return '•••••••• (مشفر)';
  }
  return str;
};

