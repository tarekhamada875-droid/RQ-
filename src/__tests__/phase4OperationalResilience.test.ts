import { describe, it, expect } from 'vitest';
import { getRawPlate, getPlateParts, isPlateValid, normalizeArabicSearch } from '../utils';
import { isSubscriptionExpired, getRemainingSubscriptionInfo } from '../domain/garage/subscription';
import { listenerTracker } from '../utils/listenerTracker';

describe('Phase 4: Operational Data Integrity & Real-Time Sync Resilience', () => {
  describe('1. Plate Normalization & Sanitization', () => {
    it('normalizes Eastern Arabic numerals and Alef variations in plate numbers', () => {
      // Arabic digits ١٢٣ -> 123, and Alef variations
      const rawPlate = getRawPlate('أ ب ج ١٢٣');
      expect(rawPlate).toBe('أبج123');

      const parts = getPlateParts('أ ب ج ١٢٣');
      expect(parts.letters).toBe('أبج');
      expect(parts.numbers).toBe('123');
      expect(isPlateValid('أ ب ج ١٢٣')).toBe(true);
    });

    it('rejects incomplete plates without numbers or letters', () => {
      expect(isPlateValid('١٢٣')).toBe(false); // No letters
      expect(isPlateValid('أ ب ج')).toBe(false); // No numbers
      expect(isPlateValid('')).toBe(false);
    });

    it('normalizes search terms across Arabic orthographic variants', () => {
      expect(normalizeArabicSearch('إبراهيم')).toBe('ابراهيم');
      expect(normalizeArabicSearch('سيارة')).toBe('سياره');
      expect(normalizeArabicSearch('مستشفي')).toBe('مستشفي');
    });
  });

  describe('2. Multi-Package Expiry & Subscription Guard Rails', () => {
    it('correctly handles standard, trial, and custom package expiries', () => {
      const now = Date.now();
      const activeWeekly = { balanceExpiry: new Date(now + 7 * 86400000) };
      const activeBiWeekly = { balanceExpiry: new Date(now + 15 * 86400000) };
      const expiredMonthly = { balanceExpiry: new Date(now - 86400000) };

      expect(isSubscriptionExpired(activeWeekly)).toBe(false);
      expect(isSubscriptionExpired(activeBiWeekly)).toBe(false);
      expect(isSubscriptionExpired(expiredMonthly)).toBe(true);
    });

    it('flags urgent countdown warning when remaining time is 5 hours or less', () => {
      const urgentGarage = {
        balanceExpiry: new Date(Date.now() + 3 * 3600 * 1000) // 3 hours left
      };
      const info = getRemainingSubscriptionInfo(urgentGarage);
      expect(info.isUrgentRed).toBe(true);
      expect(info.unit).toBe('hours');
      expect(info.displayCount).toBe(3);
    });
  });

  describe('3. Listener Leak Prevention & Unsubscribe Cleanup', () => {
    it('registers and unregisters Firestore listeners without leaking subscriptions', () => {
      listenerTracker.reset();
      expect(listenerTracker.getActiveListenerCount()).toBe(0);

      const unsub1 = listenerTracker.register('garages/g123/active_vehicles');
      const unsub2 = listenerTracker.register('garages/g123/today_transactions');

      expect(listenerTracker.getActiveListenerCount()).toBe(2);

      unsub1();
      expect(listenerTracker.getActiveListenerCount()).toBe(1);

      unsub2();
      expect(listenerTracker.getActiveListenerCount()).toBe(0);
    });
  });
});
