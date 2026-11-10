import { describe, expect, it } from 'vitest';
import { formatPlateNumber, getPlateParts, getRawPlate } from '../utils/plates';

describe('duplication refactor domain contracts', () => {
  describe('Arabic plate contracts', () => {
    it('uses Western digits for the storage/search representation', () => {
      // getRawPlate normalizes Alef variants (أ→ا) AND Arabic digits (١→1)
      // for server-side matching.
      expect(getRawPlate('أ ب ج ١٢٣٤')).toBe('ابج1234');
      // getPlateParts uses getCleanPlate (display-safe) which preserves
      // original Arabic letters (أ) and Arabic-Indic digits (١٢٣٤).
      expect(getPlateParts('أ ب ج ١٢٣٤')).toEqual({ letters: 'أبج', numbers: '١٢٣٤' });
    });

    it('keeps display formatting separate from storage normalization', () => {
      expect(formatPlateNumber('أ ب ج ١٢٣٤')).toBe('ا ب ج : ١٢٣٤');
      expect(getRawPlate('أ ب ج ١٢٣٤')).not.toBe(formatPlateNumber('أ ب ج ١٢٣٤'));
    });

    it('caps plates at four letters and four digits consistently', () => {
      // getPlateParts now preserves original letters (أ instead of ا)
      // and Arabic-Indic digits (١٢٣٤ instead of 1234) for display.
      expect(getPlateParts('أ ب ج د هـ ١ ٢ ٣ ٤ ٥')).toEqual({
        letters: 'أبجد',
        numbers: '١٢٣٤'
      });
    });
  });
});
