import { describe, it, expect } from 'vitest';
import { validateId, ValidationError } from './validation';

describe('validateId (audit N10, N11)', () => {
  describe('N10: whitespace is rejected (was previously allowed)', () => {
    it('rejects an ID with a space in the middle', () => {
      expect(() => validateId('garage 1', 'garageId')).toThrow(ValidationError);
      expect(() => validateId('garage 1', 'garageId')).toThrow(/Invalid characters/);
    });

    it('rejects an ID with a newline', () => {
      expect(() => validateId('garage\n1', 'garageId')).toThrow(ValidationError);
      expect(() => validateId('garage\n1', 'garageId')).toThrow(/Invalid characters/);
    });

    it('rejects an ID with a tab', () => {
      expect(() => validateId('garage\t1', 'garageId')).toThrow(ValidationError);
      expect(() => validateId('garage\t1', 'garageId')).toThrow(/Invalid characters/);
    });

    it('rejects an ID with a carriage return', () => {
      expect(() => validateId('garage\r1', 'garageId')).toThrow(ValidationError);
      expect(() => validateId('garage\r1', 'garageId')).toThrow(/Invalid characters/);
    });

    it('rejects an ID with a vertical tab', () => {
      expect(() => validateId('garage\v1', 'garageId')).toThrow(ValidationError);
      expect(() => validateId('garage\v1', 'garageId')).toThrow(/Invalid characters/);
    });

    it('rejects an ID with a form feed', () => {
      expect(() => validateId('garage\f1', 'garageId')).toThrow(ValidationError);
      expect(() => validateId('garage\f1', 'garageId')).toThrow(/Invalid characters/);
    });
  });

  describe('N11: valid IDs are accepted (regression — make sure tightening did not over-reject)', () => {
    it('accepts a plain ASCII alphanumeric ID', () => {
      expect(validateId('garage-1', 'garageId')).toBe('garage-1');
      expect(validateId('garage_1', 'garageId')).toBe('garage_1');
      expect(validateId('garage.1', 'garageId')).toBe('garage.1');
      expect(validateId('garage:1', 'garageId')).toBe('garage:1');
      expect(validateId('garage@1', 'garageId')).toBe('garage@1');
    });

    it('accepts a UUID-style ID', () => {
      expect(validateId('550e8400-e29b-41d4-a716-446655440000', 'garageId'))
        .toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('accepts a numeric ID', () => {
      expect(validateId('12345', 'garageId')).toBe('12345');
    });

    it('trims surrounding whitespace but rejects internal whitespace', () => {
      // '  garage-1  ' is trimmed to 'garage-1' (valid)
      expect(validateId('  garage-1  ', 'garageId')).toBe('garage-1');
      // 'garage 1' has internal space — rejected even after trim
      expect(() => validateId('  garage 1  ', 'garageId')).toThrow(ValidationError);
    });
  });

  describe('required=false allows empty', () => {
    it('returns empty string for undefined/null/empty when not required', () => {
      expect(validateId(undefined, 'garageId', false)).toBe('');
      expect(validateId(null, 'garageId', false)).toBe('');
      expect(validateId('', 'garageId', false)).toBe('');
    });

    it('throws when required and missing', () => {
      expect(() => validateId(undefined, 'garageId', true)).toThrow(/garageId is required/);
      expect(() => validateId(null, 'garageId', true)).toThrow(/garageId is required/);
      expect(() => validateId('', 'garageId', true)).toThrow(/garageId is required/);
    });
  });
});
