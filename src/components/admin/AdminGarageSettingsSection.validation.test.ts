import { describe, expect, it } from 'vitest';
import { isValidStaffPin, applyStaffPinUpdate } from './AdminGarageSettingsSection';
import type { Staff } from '../../types';

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

describe('applyStaffPinUpdate (F2 regression: no in-place mutation)', () => {
  const buildStaff = (id: string, pin: string): Staff => ({
    id,
    name: `staff-${id}`,
    pin,
    garageId: 'g1',
    role: 'staff',
  });

  it('returns a NEW array reference (does not mutate input)', () => {
    const original = [buildStaff('s1', '11111'), buildStaff('s2', '22222')];
    const snapshot = [...original];
    const result = applyStaffPinUpdate(original, 's1', '99999');
    expect(result).not.toBe(original);
    // input array reference unchanged
    expect(original).toEqual(snapshot);
  });

  it('does NOT mutate the matched staff object (returns a new object)', () => {
    const s1 = buildStaff('s1', '11111');
    const original = [s1, buildStaff('s2', '22222')];
    const result = applyStaffPinUpdate(original, 's1', '99999');
    // the original object's `pin` is unchanged
    expect(s1.pin).toBe('11111');
    // the result contains a NEW object at the matched index
    expect(result[0]).not.toBe(s1);
    expect(result[0].pin).toBe('99999');
  });

  it('leaves non-matched staff object references untouched (referential equality)', () => {
    const s1 = buildStaff('s1', '11111');
    const s2 = buildStaff('s2', '22222');
    const result = applyStaffPinUpdate([s1, s2], 's1', '99999');
    expect(result[1]).toBe(s2);
  });

  it('returns the input array length unchanged when id matches', () => {
    const original = [buildStaff('s1', '11111'), buildStaff('s2', '22222')];
    const result = applyStaffPinUpdate(original, 's1', '99999');
    expect(result).toHaveLength(2);
  });

  it('is a no-op (returns new array of same elements) when no id matches', () => {
    const s1 = buildStaff('s1', '11111');
    const s2 = buildStaff('s2', '22222');
    const original = [s1, s2];
    const result = applyStaffPinUpdate(original, 'nonexistent', '99999');
    expect(result).not.toBe(original); // new array reference
    expect(result[0]).toBe(s1);          // but elements preserved by reference
    expect(result[1]).toBe(s2);
    expect(result[0].pin).toBe('11111');
    expect(result[1].pin).toBe('22222');
  });
});
