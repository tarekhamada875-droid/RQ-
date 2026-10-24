import { describe, expect, it } from 'vitest';
import { isValidStaffPin } from './AdminGarageSettingsSection';

describe('isValidStaffPin', () => {
  it('accepts exactly eight digits', () => {
    expect(isValidStaffPin('12345678')).toBe(true);
  });

  it('rejects values shorter or longer than eight digits', () => {
    expect(isValidStaffPin('1234567')).toBe(false);
    expect(isValidStaffPin('123456789')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isValidStaffPin('1234abcd')).toBe(false);
  });
});
