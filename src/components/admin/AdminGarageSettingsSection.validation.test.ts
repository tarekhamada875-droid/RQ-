import { describe, expect, it } from 'vitest';
import { isValidStaffPin } from './AdminGarageSettingsSection';

describe('isValidStaffPin', () => {
  it('accepts exactly five digits', () => {
    expect(isValidStaffPin('12345')).toBe(true);
  });

  it('rejects values shorter or longer than five digits', () => {
    expect(isValidStaffPin('1234')).toBe(false);
    expect(isValidStaffPin('123456')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(isValidStaffPin('1234abcd')).toBe(false);
  });
});
