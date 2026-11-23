import { describe, it, expect } from 'vitest';
import { buildActivityLogEntry, activityLogExpireAt, ACTIVITY_LOG_TTL_DAYS, ACTIVITY_LOG_TTL_MS } from './activityLogWriter';

describe('activityLogWriter', () => {
  describe('buildActivityLogEntry', () => {
    it('adds an expireAt field set to timestamp + 30 days', () => {
      const timestamp = new Date('2026-11-23T12:00:00Z');
      const entry = buildActivityLogEntry({
        garageId: 'garage-1',
        actionType: 'check_out',
        timestamp,
        amount: 5,
      });
      expect(entry.expireAt).toBeInstanceOf(Date);
      const expectedMs = timestamp.getTime() + ACTIVITY_LOG_TTL_MS;
      expect((entry.expireAt as Date).getTime()).toBe(expectedMs);
    });

    it('preserves all original payload fields', () => {
      const timestamp = new Date('2026-11-23T12:00:00Z');
      const entry = buildActivityLogEntry({
        garageId: 'garage-1',
        garageName: 'Test Garage',
        staffId: 'staff-1',
        staffName: 'Test Staff',
        actionType: 'check_out',
        plateNumber: '1234-ABC',
        timestamp,
        amount: 7.5,
        details: { durationHours: 2 },
      });
      expect(entry).toMatchObject({
        garageId: 'garage-1',
        garageName: 'Test Garage',
        staffId: 'staff-1',
        staffName: 'Test Staff',
        actionType: 'check_out',
        plateNumber: '1234-ABC',
        amount: 7.5,
        details: { durationHours: 2 },
      });
      // timestamp preserved verbatim
      expect(entry.timestamp).toBe(timestamp);
    });

    it('handles Firestore-Timestamp-shaped timestamp objects (.toDate)', () => {
      const date = new Date('2026-11-23T12:00:00Z');
      const fakeFirestoreTimestamp = { toDate: () => date };
      const entry = buildActivityLogEntry({
        garageId: 'g',
        actionType: 'credit_grant',
        timestamp: fakeFirestoreTimestamp,
      });
      expect((entry.expireAt as Date).getTime()).toBe(date.getTime() + ACTIVITY_LOG_TTL_MS);
    });

    it('handles Firestore-Timestamp-shaped timestamp objects (.toMillis)', () => {
      const ms = new Date('2026-11-23T12:00:00Z').getTime();
      const fakeFirestoreTimestamp = { toMillis: () => ms };
      const entry = buildActivityLogEntry({
        garageId: 'g',
        actionType: 'credit_grant',
        timestamp: fakeFirestoreTimestamp,
      });
      expect((entry.expireAt as Date).getTime()).toBe(ms + ACTIVITY_LOG_TTL_MS);
    });

    it('falls back to Date.now() when payload has no timestamp (rare)', () => {
      const beforeMs = Date.now();
      const entry = buildActivityLogEntry({
        garageId: 'g',
        actionType: 'credit_grant',
        // no timestamp field
      });
      const afterMs = Date.now();
      const expireMs = (entry.expireAt as Date).getTime();
      expect(expireMs).toBeGreaterThanOrEqual(beforeMs + ACTIVITY_LOG_TTL_MS);
      expect(expireMs).toBeLessThanOrEqual(afterMs + ACTIVITY_LOG_TTL_MS);
    });

    it('does NOT mutate the input payload', () => {
      const payload = {
        garageId: 'g',
        actionType: 'check_out',
        timestamp: new Date(),
        amount: 3,
      };
      const snapshot = { ...payload };
      buildActivityLogEntry(payload);
      expect(payload).toEqual(snapshot);
      expect((payload as any).expireAt).toBeUndefined();
    });
  });

  describe('activityLogExpireAt', () => {
    it('returns a Date 30 days after the input', () => {
      const ts = new Date('2026-11-23T12:00:00Z');
      const expire = activityLogExpireAt(ts);
      expect(expire.getTime()).toBe(ts.getTime() + ACTIVITY_LOG_TTL_MS);
    });

    it('accepts a Date number', () => {
      const ms = new Date('2026-11-23T12:00:00Z').getTime();
      expect(activityLogExpireAt(ms).getTime()).toBe(ms + ACTIVITY_LOG_TTL_MS);
    });

    it('accepts Firestore-Timestamp-shaped objects', () => {
      const ts = new Date('2026-11-23T12:00:00Z');
      expect(activityLogExpireAt({ toDate: () => ts }).getTime()).toBe(ts.getTime() + ACTIVITY_LOG_TTL_MS);
    });
  });

  describe('TTL constants', () => {
    it('ACTIVITY_LOG_TTL_DAYS is 30', () => {
      expect(ACTIVITY_LOG_TTL_DAYS).toBe(30);
    });

    it('ACTIVITY_LOG_TTL_MS is 30 * 24 * 60 * 60 * 1000', () => {
      expect(ACTIVITY_LOG_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });
});
