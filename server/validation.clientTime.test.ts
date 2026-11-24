/**
 * Unit bounds for parsePlausibleClientTime (Offline Step 3).
 *
 * The tap-time window is deliberately tight — a broken phone clock must
 * never move money. These tests document each boundary decision.
 */
import { describe, it, expect } from 'vitest';
import {
  parsePlausibleClientTime,
  CLIENT_TIME_MAX_FUTURE_MS,
  CLIENT_TIME_MAX_PAST_MS,
} from '../server/validation';

describe('parsePlausibleClientTime', () => {
  const now = Date.parse('2026-11-24T12:00:00.000Z');

  it('accepts a plausible past tap time (offline envelope)', () => {
    const val = '2026-11-24T09:00:00.000Z'; // 3h back
    expect(parsePlausibleClientTime(val, now)?.toISOString()).toBe(val);
  });

  it('accepts a small future skew (within tolerance)', () => {
    const val = new Date(now + 30_000).toISOString();
    expect(parsePlausibleClientTime(val, now)?.getTime()).toBe(now + 30_000);
  });

  it('rejects a future time beyond the skew tolerance', () => {
    const val = new Date(now + CLIENT_TIME_MAX_FUTURE_MS + 1).toISOString();
    expect(parsePlausibleClientTime(val, now)).toBeNull();
  });

  it('rejects a tap older than the max past window', () => {
    const val = new Date(now - CLIENT_TIME_MAX_PAST_MS - 1).toISOString();
    expect(parsePlausibleClientTime(val, now)).toBeNull();
  });

  it('accepts a tap exactly at the past boundary', () => {
    const val = new Date(now - CLIENT_TIME_MAX_PAST_MS).toISOString();
    expect(parsePlausibleClientTime(val, now)?.getTime()).toBe(now - CLIENT_TIME_MAX_PAST_MS);
  });

  it('rejects missing, malformed and non-string values', () => {
    expect(parsePlausibleClientTime(undefined, now)).toBeNull();
    expect(parsePlausibleClientTime(null, now)).toBeNull();
    expect(parsePlausibleClientTime('', now)).toBeNull();
    expect(parsePlausibleClientTime('not-a-date', now)).toBeNull();
    expect(parsePlausibleClientTime(12345, now)).toBeNull();
  });
});
