import { describe, expect, it } from 'vitest';
import {
  formatPlateNumber,
  getPlateParts,
  getRawPlate,
  validateRechargeRequest
} from '../utils';

describe('duplication refactor domain contracts', () => {
  describe('recharge request variants', () => {
    it('accepts subscription requests using packageId and revenueAmount', () => {
      expect(validateRechargeRequest({
        garageId: 'garage-1',
        packageId: 'monthly-30',
        revenueAmount: 500
      })).toEqual({ valid: true, errors: [] });
    });

    it('accepts balance top-ups using the amount field', () => {
      expect(validateRechargeRequest({
        garageId: 'garage-1',
        packageId: 'balance_topup',
        amount: 250
      })).toEqual({ valid: true, errors: [] });
    });

    it('rejects a request that has neither package identity nor package name', () => {
      const result = validateRechargeRequest({ garageId: 'garage-1', amount: 250 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('الباقة مطلوبة');
    });

    it('rejects negative financial amounts for either request variant', () => {
      expect(validateRechargeRequest({
        garageId: 'garage-1', packageId: 'monthly-30', revenueAmount: -1
      }).valid).toBe(false);
      expect(validateRechargeRequest({
        garageId: 'garage-1', packageId: 'balance_topup', amount: -1
      }).valid).toBe(false);
    });
  });

  describe('Arabic plate contracts', () => {
    it('uses Western digits for the storage/search representation', () => {
      expect(getRawPlate('أ ب ج ١٢٣٤')).toBe('أبج1234');
      expect(getPlateParts('أ ب ج ١٢٣٤')).toEqual({ letters: 'أبج', numbers: '1234' });
    });

    it('keeps display formatting separate from storage normalization', () => {
      expect(formatPlateNumber('أ ب ج ١٢٣٤')).toBe('أ ب ج : ١٢٣٤');
      expect(getRawPlate('أ ب ج ١٢٣٤')).not.toBe(formatPlateNumber('أ ب ج ١٢٣٤'));
    });

    it('caps plates at four letters and four digits consistently', () => {
      expect(getPlateParts('أ ب ج د هـ ١ ٢ ٣ ٤ ٥')).toEqual({
        letters: 'أبجد',
        numbers: '1234'
      });
    });
  });
});
