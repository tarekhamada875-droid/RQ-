import { describe, it, expect } from 'vitest';
import { normalizePhone, cleanPin } from './pinCrypto';

describe('Phone + PIN normalization (audit N9, N10)', () => {
  describe('normalizePhone (audit N9)', () => {
    it('keeps the leading + and digits, strips everything else', () => {
      expect(normalizePhone('+20 100 123 4567')).toBe('+201001234567');
      expect(normalizePhone('+20-100-123-4567')).toBe('+201001234567');
      expect(normalizePhone('+20(100)123-4567')).toBe('+201001234567');
      expect(normalizePhone(' +201001234567 ')).toBe('+201001234567');
    });

    it('matches the client-side normalizePhone in src/utils/plates.ts:128', () => {
      // Client: normalizeDigits(phone.trim()).replace(/[^\d+]/g, '')
      // Server must produce identical output for the same input — otherwise
      // a delegate who registered with one normalization can't log in.
      const samples = [
        '+201001234567',
        '010 1234 5678',
        '010-1234-5678',
        '(010) 1234 5678',
        '01012345678',
        '+20 10 1234 5678',
        '', // empty
        '   ', // whitespace only
      ];
      for (const sample of samples) {
        // Client-side shape: normalizeDigits(phone.trim()).replace(/[^\d+]/g, '')
        // (normalizeDigits on ASCII digits is a no-op; for the test we use
        // ASCII-only samples so the two implementations must agree.)
        const clientShape = sample.trim().replace(/[^\d+]/g, '');
        expect(normalizePhone(sample)).toBe(clientShape);
      }
    });

    it('does NOT strip + (was the bug — cleanPin stripped it)', () => {
      // The previous code path used cleanPin(credentials.phone) which
      // strips ALL non-digits including +. This caused delegates with +
      // in their stored phone to be unable to log in.
      expect(cleanPin('+201001234567')).toBe('201001234567'); // cleanPin strips +
      expect(normalizePhone('+201001234567')).toBe('+201001234567'); // normalizePhone keeps +
    });

    it('normalizes Arabic-Indic digits to ASCII', () => {
      // normalizeDigits inside normalizePhone converts ٠١٢٣ to 0123.
      expect(normalizePhone('+٢٠١٠٠١٢٣٤٥٦٧')).toBe('+201001234567');
    });

    it('returns empty string for null/undefined/empty input', () => {
      expect(normalizePhone(null)).toBe('');
      expect(normalizePhone(undefined)).toBe('');
      expect(normalizePhone('')).toBe('');
    });
  });
});
