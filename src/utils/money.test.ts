import { describe, expect, it } from 'vitest';
import { formatNumberEn, formatNumberAr } from './money';

/**
 * Audit F-18 (Phase 4b, 2026-11-26) — pins the canonical number formats.
 *
 * Before F-18 the app had ~30 inline toLocaleString calls with three
 * disagreeing locales (en-US, ar-EG, and one bare call that depended on each
 * admin's browser locale). The same EGP amount could render "1,000" on one
 * admin screen and "١٬٠٠٠" on another. These tests pin the two canonical
 * formats so the module stays the single source of truth.
 */
describe('formatNumberEn — canonical admin/delegate number format', () => {
  it('formats with Latin digits and grouping separators', () => {
    expect(formatNumberEn(1000)).toBe('1,000');
    expect(formatNumberEn(1234)).toBe('1,234');
    expect(formatNumberEn(2000)).toBe('2,000');
    expect(formatNumberEn(0)).toBe('0');
    expect(formatNumberEn(7)).toBe('7');
  });

  it('passes Intl options through (commission heroes use maximumFractionDigits)', () => {
    expect(formatNumberEn(1234.5, { maximumFractionDigits: 0 })).toBe('1,235');
    expect(formatNumberEn(1234.56, { maximumFractionDigits: 1 })).toBe('1,234.6');
    expect(formatNumberEn(1234.56, { maximumFractionDigits: 2 })).toBe('1,234.56');
  });

  it('guards null/undefined/NaN to 0 (callers previously hand-rolled ?? 0 inconsistently)', () => {
    expect(formatNumberEn(null)).toBe('0');
    expect(formatNumberEn(undefined)).toBe('0');
    expect(formatNumberEn(Number.NaN)).toBe('0');
    expect(formatNumberEn(Infinity)).toBe('0');
  });
});

describe('formatNumberAr — canonical garage-facing number format', () => {
  it('formats with Arabic-Indic digits (ar-EG)', () => {
    // Arabic-Indic digit shapes for 1000: ١٬٠٠٠ (U+0660 range + U+066C separator)
    expect(formatNumberAr(1000)).toBe((1000).toLocaleString('ar-EG'));
    expect(formatNumberAr(0)).toBe((0).toLocaleString('ar-EG'));
    // Pin the digit system: must contain Arabic-Indic digits, never Latin.
    expect(formatNumberAr(1234)).not.toMatch(/[0-9]/);
    expect(formatNumberAr(1234)).toMatch(/[\u0660-\u0669]/);
  });

  it('guards null/undefined/NaN to Arabic zero', () => {
    expect(formatNumberAr(null)).toBe((0).toLocaleString('ar-EG'));
    expect(formatNumberAr(undefined)).toBe((0).toLocaleString('ar-EG'));
    expect(formatNumberAr(Number.NaN)).toBe((0).toLocaleString('ar-EG'));
  });
});
