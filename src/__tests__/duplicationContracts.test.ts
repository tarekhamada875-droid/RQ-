import { describe, expect, it } from 'vitest';
import {
  formatPlateNumber,
  getPlateParts,
  getRawPlate,
} from '../utils';

describe('duplication refactor domain contracts', () => {
  describe('Arabic plate contracts', () => {
    it('uses Western digits for the storage/search representation', () => {
      expect(getRawPlate('أ ب ج ١٢٣٤')).toBe('ابج1234');
      expect(getPlateParts('أ ب ج ١٢٣٤')).toEqual({ letters: 'ابج', numbers: '1234' });
    });

    it('keeps display formatting separate from storage normalization', () => {
      expect(formatPlateNumber('أ ب ج ١٢٣٤')).toBe('ا ب ج : ١٢٣٤');
      expect(getRawPlate('أ ب ج ١٢٣٤')).not.toBe(formatPlateNumber('أ ب ج ١٢٣٤'));
    });

    it('caps plates at four letters and four digits consistently', () => {
      expect(getPlateParts('أ ب ج د هـ ١ ٢ ٣ ٤ ٥')).toEqual({
        letters: 'ابجد',
        numbers: '1234'
      });
    });
  });
});
