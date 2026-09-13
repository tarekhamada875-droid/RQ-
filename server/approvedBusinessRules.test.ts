import { describe, expect, it } from 'vitest';
import { ValidationError, validateDateRange } from './validation';

describe('approved business rules', () => {
  describe('subscriber date ranges', () => {
    it('accepts valid same-day and forward date ranges', () => {
      expect(validateDateRange('2026-09-13', '2026-09-13')).toEqual({
        startDate: '2026-09-13',
        endDate: '2026-09-13',
      });
      expect(validateDateRange('2026-09-13', '2026-10-01').endDate).toBe('2026-10-01');
    });

    it('rejects malformed or impossible calendar dates', () => {
      expect(() => validateDateRange('2026-02-30', '2026-03-01')).toThrow(ValidationError);
      expect(() => validateDateRange('13-09-2026', '2026-10-01')).toThrow(ValidationError);
    });

    it('rejects an end date before the start date', () => {
      expect(() => validateDateRange('2026-10-01', '2026-09-13')).toThrowError(
        expect.objectContaining({ code: 'INVALID_SUBSCRIBER_DATE_RANGE' }),
      );
    });
  });
});
