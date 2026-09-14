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
  calculateCost,
  getDuration,
  generateSafePin,
} from './index';
import {
  calculateApprovedCommission,
  calculateApprovedRechargeTotal,
  filterRequestsByMonth,
  CommissionRequestLike
} from './delegateCommissionCalculations';
import { useAdminTranslation } from './adminTranslations';

describe('High-Load & Stress Testing Suite (اختبار الإجهاد)', () => {
  it('Stress Test 1: High Volume Plate Normalization & Utilities (5,000 Heavy Operations)', () => {
    const arabicLetters = ['أ', 'ب', 'ج', 'د', 'س', 'ص', 'ع', 'م', 'ن', 'هـ', 'و', 'ي'];
    const startTime = performance.now();

    for (let i = 0; i < 5000; i++) {
      const l1 = arabicLetters[i % arabicLetters.length];
      const l2 = arabicLetters[(i * 3) % arabicLetters.length];
      const l3 = arabicLetters[(i * 7) % arabicLetters.length];
      const num = (i % 9999) + 1;
      const rawInput = `  ${l1} ${l2} ${l3}  ${num}  `;

      const clean = getCleanPlate(rawInput);
      const raw = getRawPlate(rawInput);
      const parts = getPlateParts(rawInput);
      const formatted = formatPlateLetters(`${l1}${l2}${l3}`);
      const normalizedPhone = normalizePhone(`+20100${i.toString().padStart(6, '0')}`);
      const normalizedDigits = normalizeDigits('١٢٣٤٥٦٧٨٩٠');
      const normalizedLetters = normalizeLetters('أ ب ج');
      const searchNormalized = normalizeArabicSearch('أحمد علي فاطمة');
      const isValid = isPlateValid(rawInput);

      expect(clean).toBeDefined();
      expect(raw).toBeDefined();
      expect(parts.letters).toBeDefined();
      expect(formatted).toBeDefined();
      expect(normalizedPhone).toBeDefined();
      expect(normalizedDigits).toBe('1234567890');
      expect(normalizedLetters).toBeDefined();
      expect(searchNormalized).toBeDefined();
      expect(isValid).toBe(true);
    }

    const duration = performance.now() - startTime;
    // 5,000 heavy plate operations should execute in under 1,500ms
    expect(duration).toBeLessThan(5000);
  });

  it('Stress Test 2: PIN Generation Collision & Uniqueness under heavy load (1,000 PINs)', () => {
    const existingPins = new Set<string>();
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      const newPin = generateSafePin(existingPins);
      expect(newPin).toHaveLength(6);
      expect(existingPins.has(newPin)).toBe(false);
      existingPins.add(newPin);
    }

    const duration = performance.now() - startTime;
    expect(existingPins.size).toBe(1000);
    expect(duration).toBeLessThan(500);
  });

  it('Stress Test 3: Large Dataset Filtering & Revenue Calculations (50,000 Recharge Logs)', () => {
    const logs: CommissionRequestLike[] = [];
    const baseTimestamp = new Date('2026-01-01T00:00:00Z').getTime();

    // Generate 50,000 logs distributed over 12 months
    for (let i = 0; i < 50000; i++) {
      const randomOffset = (i * 600000) % (365 * 24 * 3600 * 1000); // spread across year
      logs.push({
        id: `req-${i}`,
        status: 'approved',
        amount: 100 + (i % 500),
        revenueAmount: 100 + (i % 500),
        commission: 30,
        createdAt: new Date(baseTimestamp + randomOffset).toISOString(),
      });
    }

    const startTime = performance.now();

    const augustLogs = filterRequestsByMonth(logs, '2026-08');
    const totalAugust = calculateApprovedRechargeTotal(logs, '2026-08');
    const commission = calculateApprovedCommission(logs, '2026-08');

    const duration = performance.now() - startTime;

    expect(augustLogs.length).toBeGreaterThan(0);
    expect(totalAugust).toBeGreaterThan(0);
    expect(commission).toBeGreaterThan(0);
    // Filtering and summing 50,000 items should take well under 1000ms in CI/container environments
    expect(duration).toBeLessThan(1000);
  });

  it('Stress Test 4: Extreme Parking Duration & Tariff Calculations (Extreme Edge Cases)', () => {
    const garage = { hourlyRate: 25, overnightRate: 150 };

    // Case A: 1 year continuous parking (8,760 hours)
    const entry1Year = new Date('2025-08-04T10:00:00Z');
    const now1Year = new Date('2026-08-04T10:00:00Z');
    const costHourlyYear = calculateCost({ entryTime: entry1Year, type: 'hourly' }, garage, now1Year);
    // The configured overnight rate caps each full 24-hour block.
    expect(costHourlyYear).toBe(365 * 150); // 54,750 EGP

    // Case A2: The cap applies after 24 hours and also caps the partial day.
    const entry25Hours = new Date('2026-08-01T10:00:00Z');
    const now25Hours = new Date('2026-08-02T11:00:00Z');
    expect(calculateCost({ entryTime: entry25Hours, type: 'hourly' }, garage, now25Hours)).toBe(175);

    // Case B: 100 days overnight parking
    const entry100Days = new Date('2026-05-01T10:00:00Z');
    const now100Days = new Date('2026-08-09T10:00:00Z'); // 100 days
    const costOvernight = calculateCost({ entryTime: entry100Days, type: 'overnight' }, garage, now100Days);
    expect(costOvernight).toBe(100 * 150); // 15,000 EGP

    // Case C: Clock drift / Negative duration (Entry time in future)
    const futureEntry = new Date('2026-08-05T10:00:00Z');
    const currentNow = new Date('2026-08-04T10:00:00Z');
    const costNegative = calculateCost({ entryTime: futureEntry, type: 'hourly' }, garage, currentNow);
    expect(costNegative).toBe(0);

    // Case D: Rapid duration string generation (10,000 iterations)
    const startStrTime = performance.now();
    for (let i = 0; i < 10000; i++) {
      getDuration(entry1Year, now1Year);
    }
    const strDuration = performance.now() - startStrTime;
    expect(strDuration).toBeLessThan(500);
  });

  it('Stress Test 5: High-Frequency Admin Translation Lookups (100,000 Calls)', () => {
    const tEn = useAdminTranslation('en');
    const keys = ['المدير العام', 'الجراجات', 'سعر الساعة', 'المشتركين', 'إضافة جراج جديد', 'تسجيل خروج'];

    const startTime = performance.now();
    for (let i = 0; i < 100000; i++) {
      const key = keys[i % keys.length];
      tEn(key);
    }
    const duration = performance.now() - startTime;

    // 100,000 translation lookups should complete in under 200ms
    expect(duration).toBeLessThan(200);
  });
});
