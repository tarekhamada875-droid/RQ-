import { describe, expect, it } from 'vitest';
import { isValidSessionId } from './validation';

describe('isValidSessionId', () => {
  // Valid formats
  it.each([
    ['canonical UUID v4', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    ['legacy sess_ prefix', 'sess_abc12345'],
    ['legacy fallback_session_ prefix', 'fallback_session_1234567890'],
    ['simple alphanumeric', 'session-a'],
    ['underscore separator', 'delegate_device_a'],
    ['exactly 8 chars', 'abcdefgh'],
  ])('accepts %s', (_label, sid) => {
    expect(isValidSessionId(sid)).toBe(true);
  });

  // Invalid formats
  it.each([
    ['empty string', ''],
    ['too short (7 chars)', 'abcdefg'],
    ['contains space', 'has space'],
    ['contains slash', 'has/slash'],
    ['contains dot', 'has.dot'],
    ['contains colon', 'has:colon'],
    ['non-string (number)', 12345678],
    ['non-string (null)', null],
    ['non-string (undefined)', undefined],
  ])('rejects %s', (_label, sid) => {
    expect(isValidSessionId(sid)).toBe(false);
  });

  it('rejects strings longer than 128 chars', () => {
    expect(isValidSessionId('a'.repeat(129))).toBe(false);
  });

  it('accepts strings of exactly 128 chars', () => {
    expect(isValidSessionId('a'.repeat(128))).toBe(true);
  });
});
