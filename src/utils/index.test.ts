import { describe, it, expect, vi } from 'vitest';
import {
  normalizeDigits,
  formatArabicDigits,
  normalizeLetters,
  normalizeArabicSearch,
  getCleanPlate,
  getRawPlate,
  getPlateParts,
  isPlateValid,
  normalizePhone,
  formatPlateNumber,
} from './plates';
import { getDuration, isSessionActive } from './dates';
import { calculateCost } from './cost';
import { generateSafePin } from './pins';
import { isLightColor } from './colors';
import { throttleSnapshot } from './storage';

describe('Normalization & String Utilities Edge Cases', () => {
  it('handles mixed eastern and western digits accurately', () => {
    expect(normalizeDigits('١2٣4٥6٧8٩0')).toBe('1234567890');
    expect(normalizeDigits('  ١٢٣  ')).toBe('  123  ');
  });

  it('formatArabicDigits converts Western digits to Arabic-Indic for display', () => {
    // Basic conversion
    expect(formatArabicDigits('123')).toBe('١٢٣');
    expect(formatArabicDigits('0')).toBe('٠');
    expect(formatArabicDigits('9876543210')).toBe('٩٨٧٦٥٤٣٢١٠');
  });

  it('formatArabicDigits passes through non-digit characters unchanged', () => {
    // Arabic letters stay as-is
    expect(formatArabicDigits('ابج123')).toBe('ابج١٢٣');
    // Spaces, symbols, Latin letters, punctuation preserved
    expect(formatArabicDigits('abc 123 !@#')).toBe('abc ١٢٣ !@#');
    // Already-Arabic digits stay Arabic (no double-conversion)
    expect(formatArabicDigits('١٢٣')).toBe('١٢٣');
  });

  it('formatArabicDigits handles numbers, null, empty, and undefined', () => {
    expect(formatArabicDigits(42)).toBe('٤٢');
    expect(formatArabicDigits(0)).toBe('٠');
    expect(formatArabicDigits('')).toBe('');
    expect(formatArabicDigits(null)).toBe('');
    expect(formatArabicDigits(undefined)).toBe('');
  });

  it('formatArabicDigits is the display-side inverse of normalizeDigits', () => {
    // Round-trip: Western → Arabic (display) → Western (storage)
    const original = '1234567890';
    const displayed = formatArabicDigits(original);
    const restored = normalizeDigits(displayed);
    expect(restored).toBe(original);
  });

  it('normalizes all variations of Arabic letters consistently', () => {
    // normalizeLetters now matches server normalizePlateRaw: all Alef variants → plain ا
    expect(normalizeLetters('إسماعيل أسامة')).toBe('اسماعيل اسامه');
    expect(normalizeArabicSearch('أحمد إبراهيم هدى فاطمة')).toBe('احمد ابراهيم هدي فاطمه');
  });

  it('correctly handles complex plate extraction and edge cases', () => {
    // Normal valid Egyptian plate with 3 letters and up to 4 numbers.
    // getCleanPlate preserves original Alef variants (أ) for display;
    // getRawPlate normalizes to plain Alef (ا) for server-side matching.
    expect(getCleanPlate('أ ب ج ١ ٢ ٣ ٤')).toBe('أبج١٢٣٤');
    expect(getRawPlate('أ ب ج ١ ٢ ٣ ٤')).toBe('ابج1234');

    const parts = getPlateParts(' س ص ع  ٩ ٨ ٧ ');
    expect(parts.letters).toBe('سصع');
    expect(parts.numbers).toBe('987');

    // Validation checks
    expect(isPlateValid(' ا ب ج 1 2 3 ')).toBe(true);
    expect(isPlateValid('ا ب ج')).toBe(false); // No numbers
    expect(isPlateValid('1234')).toBe(false); // No letters
    expect(isPlateValid('')).toBe(false); // Empty
  });

  it('normalizes phone numbers retaining plus sign and removing spaces/dashes', () => {
    expect(normalizePhone('+20 (100) 123-4567')).toBe('+201001234567');
    expect(normalizePhone('010 1234 5678')).toBe('01012345678');
  });

  it('formats plate numbers visually for display', () => {
    expect(formatPlateNumber('أ ب ج 1234')).toBe('ا ب ج : 1234');
  });
});

describe('Parking Duration & Cost Calculation Comprehensive Scenarios', () => {
  const baseGarage = {
    hourlyRate: 20,
    overnightRate: 100,
  };

  it('scenario 1: Less than 5 minutes entry (Grace Period -> Free)', () => {
    const now = new Date('2026-08-04T12:04:59Z');
    const entry = new Date('2026-08-04T12:00:00Z'); // 4 minutes 59 seconds
    const vehicle = { entryTime: entry, type: 'hourly' };

    expect(calculateCost(vehicle, baseGarage, now)).toBe(0);
  });

  it('scenario 2: Exactly 5 minutes or more (Bypasses grace period)', () => {
    const now = new Date('2026-08-04T12:05:01Z');
    const entry = new Date('2026-08-04T12:00:00Z'); // 5 mins 1 sec -> 1 hour
    const vehicle = { entryTime: entry, type: 'hourly' };

    expect(calculateCost(vehicle, baseGarage, now)).toBe(20);
  });

  it('scenario 3: Multiple hours with partial minutes (Rounds up to next full hour)', () => {
    const now = new Date('2026-08-04T14:01:00Z');
    const entry = new Date('2026-08-04T12:00:00Z'); // 2 hours 1 minute -> 3 hours
    const vehicle = { entryTime: entry, type: 'hourly' };

    expect(calculateCost(vehicle, baseGarage, now)).toBe(60); // 3 * 20
  });

  it('scenario 4: Overnight rate calculation for multi-day stay', () => {
    const entry = new Date('2026-08-01T10:00:00Z');
    const now = new Date('2026-08-03T11:00:00Z'); // 49 hours -> 3 days
    const vehicle = { entryTime: entry, type: 'overnight' };

    expect(calculateCost(vehicle, baseGarage, now)).toBe(300); // 3 * 100
  });

  it('scenario 5: Active Subscriber (Always 0 EGP)', () => {
    const entry = new Date('2026-08-01T10:00:00Z');
    const now = new Date('2026-08-04T10:00:00Z');
    const vehicle = { entryTime: entry, type: 'hourly', isSubscriber: true };

    expect(calculateCost(vehicle, baseGarage, now)).toBe(0);
  });

  it('scenario 6: Missing entry time or fallback values', () => {
    const vehicle = { entryTime: null, type: 'hourly' };
    expect(calculateCost(vehicle, baseGarage)).toBe(0);
  });

  it('scenario 7: hourly billing has no cap — keeps climbing past overnight rate', () => {
    // Owner directive: hourly and overnight are independent. An hourly car pays
    // hours × rate indefinitely — no ceiling, no cap, no switching to overnight.
    // With hourlyRate=20 and overnightRate=100, the hourly total exceeds the
    // overnight rate at 5h (5*20=100) and keeps climbing.
    const entry = new Date('2026-08-01T10:00:00Z');

    // 5h: 5 × 20 = 100 (equals overnight, but NOT capped — it's hourly)
    expect(calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-01T15:00:00Z'))).toBe(100);

    // 6h: 6 × 20 = 120 (exceeds overnight, but NOT capped — keeps climbing)
    expect(calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-01T16:00:00Z'))).toBe(120);

    // 23h: 23 × 20 = 460 (way past overnight=100, but still climbing)
    expect(calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-02T09:00:00Z'))).toBe(460);

    // 24h: 24 × 20 = 480 (no dip, no cap)
    expect(calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-02T10:00:00Z'))).toBe(480);

    // 25h: 25 × 20 = 500 (keeps going)
    expect(calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-02T11:00:00Z'))).toBe(500);

    // Monotonic: always increasing, never dips
    const cost23h = calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-02T09:00:00Z'));
    const cost24h = calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-02T10:00:00Z'));
    const cost25h = calculateCost({ entryTime: entry, type: 'hourly' }, baseGarage, new Date('2026-08-02T11:00:00Z'));
    expect(cost23h).toBeLessThan(cost24h);
    expect(cost24h).toBeLessThan(cost25h);

    // Overnight car at 25h: 2 days × 100 = 200 (completely independent)
    expect(calculateCost({ entryTime: entry, type: 'overnight' }, baseGarage, new Date('2026-08-02T11:00:00Z'))).toBe(200);
  });

  it('formats getDuration output in Arabic for various time spans (audit N20 pluralization)', () => {
    const now = new Date('2026-08-04T12:00:00Z');

    // Under 1 minute
    expect(getDuration(new Date('2026-08-04T11:59:45Z'), now)).toBe('0 دقيقة');

    // 15 minutes (11+ uses singular form per Arabic grammar)
    expect(getDuration(new Date('2026-08-04T11:45:00Z'), now)).toBe('15 دقيقة');

    // 2 hours 30 mins — 2 uses dual form (ساعتان)
    expect(getDuration(new Date('2026-08-04T09:30:00Z'), now)).toBe('2 ساعتان و 30 دقيقة');

    // Days & Hours — 2 days uses dual form (يومان)
    expect(getDuration(new Date('2026-08-02T08:00:00Z'), now)).toContain('2 يومان');

    // Audit N20 (Phase 5, 2026-11-06): additional pluralization checks.
    // 3 days → plural (أيام)
    const threeDaysAgo = new Date('2026-08-01T12:00:00Z');
    const dur3 = getDuration(threeDaysAgo, now);
    expect(dur3).toContain('3 أيام');

    // 1 hour → singular (ساعة)
    const oneHourAgo = new Date('2026-08-04T11:00:00Z');
    expect(getDuration(oneHourAgo, now)).toBe('1 ساعة');

    // 5 minutes → plural (دقائق)
    const fiveMinAgo = new Date('2026-08-04T11:55:00Z');
    expect(getDuration(fiveMinAgo, now)).toBe('5 دقائق');
  });
});

describe('Security & Helper Utils', () => {
  it('detects active vs expired user sessions (10 minute threshold)', () => {
    const now = Date.now();
    expect(isSessionActive(now - 8 * 60 * 1000)).toBe(true);  // 8 mins ago -> active
    expect(isSessionActive(now - 12 * 60 * 1000)).toBe(false); // 12 mins ago -> inactive
    expect(isSessionActive(undefined)).toBe(false);
  });

  it('generates a unique 5-digit safe PIN avoiding collisions', () => {
    const existingPins = new Set(['11111', '22222', '33333']);
    const pin = generateSafePin(existingPins);

    expect(pin).toHaveLength(5);
    expect(existingPins.has(pin)).toBe(false);
  });

  it('uses crypto.getRandomValues — PIN distribution looks uniform (audit N19)', () => {
    // Generate 10000 PINs and check that each digit position has a roughly
    // uniform distribution. This is a regression test for the Math.random
    // -> crypto.getRandomValues migration (audit N19, 2026-11-06).
    // We're not asserting exact uniformity (that would be flaky), just that
    // no digit dominates (>25%) — a clear sign of a biased RNG.
    const counts: Record<string, number> = {};
    const total = 10000;
    for (let i = 0; i < total; i++) {
      const pin = generateSafePin();
      for (const ch of pin) {
        counts[ch] = (counts[ch] || 0) + 1;
      }
    }
    // Total digit samples = total * NEW_PIN_LENGTH = 50000.
    // Expected per digit = 50000 / 10 = 5000.
    // Allow ±20% (4000-6000) to avoid flakiness.
    for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const c = counts[digit] || 0;
      expect(c, `digit "${digit}" count`).toBeGreaterThanOrEqual(4000);
      expect(c, `digit "${digit}" count`).toBeLessThanOrEqual(6000);
    }
  });

  it('correctly assesses light/dark contrast and shimmer themes', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);  });
});

describe('Snapshot throttle lifecycle', () => {
  it('cancels a pending trailing snapshot', () => {
    vi.useFakeTimers();
    try {
      const callback = vi.fn();
      const throttled = throttleSnapshot(callback, 100);

      throttled('garage-a');
      throttled('garage-b');
      throttled.cancel();
      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith('garage-a');
    } finally {
      vi.useRealTimers();
    }
  });
});
