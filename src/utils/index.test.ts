import { describe, it, expect } from 'vitest';
import {
  normalizeDigits,
  normalizeLetters,
  normalizeArabicSearch,
  getCleanPlate,
  getRawPlate,
  getPlateParts,
  isPlateValid,
  formatPlateLetters,
  normalizePhone,
  formatPlateNumber,
  getDuration,
  calculateCost,
  isSessionActive,
  generateSafePin,
  resolveShimmerColor,
  isLightColor,
} from './index';

describe('Normalization & String Utilities Edge Cases', () => {
  it('handles mixed eastern and western digits accurately', () => {
    expect(normalizeDigits('١2٣4٥6٧8٩0')).toBe('1234567890');
    expect(normalizeDigits('  ١٢٣  ')).toBe('  123  ');
  });

  it('normalizes all variations of Arabic letters consistently', () => {
    expect(normalizeLetters('إسماعيل أسامة')).toBe('أسمأعيل أسأمة');
    expect(normalizeArabicSearch('أحمد إبراهيم هدى فاطمة')).toBe('احمد ابراهيم هدي فاطمه');
  });

  it('correctly handles complex plate extraction and edge cases', () => {
    // Normal valid Egyptian plate with 3 letters and up to 4 numbers
    expect(getCleanPlate('أ ب ج ١ ٢ ٣ ٤')).toBe('أبج١٢٣٤');
    expect(getRawPlate('أ ب ج ١ ٢ ٣ ٤')).toBe('أبج1234');

    const parts = getPlateParts(' س ص ع  ٩ ٨ ٧ ');
    expect(parts.letters).toBe('سصع');
    expect(parts.numbers).toBe('987');

    // Validation checks
    expect(isPlateValid(' أ ب ج 1 2 3 ')).toBe(true);
    expect(isPlateValid('أ ب ج')).toBe(false); // No numbers
    expect(isPlateValid('1234')).toBe(false); // No letters
    expect(isPlateValid('')).toBe(false); // Empty
  });

  it('normalizes phone numbers retaining plus sign and removing spaces/dashes', () => {
    expect(normalizePhone('+20 (100) 123-4567')).toBe('+201001234567');
    expect(normalizePhone('010 1234 5678')).toBe('01012345678');
  });

  it('formats plate numbers visually for display', () => {
    expect(formatPlateLetters('أبج')).toBe('أ ب ج');
    expect(formatPlateNumber('أ ب ج 1234')).toBe('أ ب ج : 1234');
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

  it('formats getDuration output in Arabic for various time spans', () => {
    const now = new Date('2026-08-04T12:00:00Z');

    // Under 1 minute
    expect(getDuration(new Date('2026-08-04T11:59:45Z'), now)).toBe('0 دقيقة');

    // 15 minutes
    expect(getDuration(new Date('2026-08-04T11:45:00Z'), now)).toBe('15 دقيقة');

    // 2 hours 30 mins
    expect(getDuration(new Date('2026-08-04T09:30:00Z'), now)).toBe('2 ساعة و 30 دقيقة');

    // Days & Hours
    expect(getDuration(new Date('2026-08-02T08:00:00Z'), now)).toContain('2 يوم');
  });
});

describe('Security & Helper Utils', () => {
  it('detects active vs expired user sessions (10 minute threshold)', () => {
    const now = Date.now();
    expect(isSessionActive(now - 8 * 60 * 1000)).toBe(true);  // 8 mins ago -> active
    expect(isSessionActive(now - 12 * 60 * 1000)).toBe(false); // 12 mins ago -> inactive
    expect(isSessionActive(undefined)).toBe(false);
  });

  it('generates a unique 6-digit safe PIN avoiding collisions', () => {
    const existingPins = new Set(['111111', '222222', '333333']);
    const pin = generateSafePin(existingPins);

    expect(pin).toHaveLength(6);
    expect(existingPins.has(pin)).toBe(false);
  });

  it('correctly assesses light/dark contrast and shimmer themes', () => {
    expect(isLightColor('#FFFFFF')).toBe(true);
    expect(isLightColor('#000000')).toBe(false);

    // Custom dark background accent color
    expect(resolveShimmerColor('#ef4444', 'dark')).toBe('#ef4444');
    // Default fallback when no custom color provided
    expect(resolveShimmerColor(undefined, 'dark')).toBe('#10b981');
  });
});
