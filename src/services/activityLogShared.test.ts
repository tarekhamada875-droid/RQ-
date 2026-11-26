import { describe, expect, it } from 'vitest';
import {
  TODAY_ACTIVITY_LOG_LIMIT,
  isMissingActivityLogIndexError,
  makeActivityLogUnavailableError,
} from './activityLogShared';
import { REPORTS_ACTIVITY_LOG_LIMIT } from '../components/garage/reports/garageReportStats';

/**
 * Audit F-6 + F-9 (Phase 3, 2026-11-26) parity tests.
 *
 * These tests exist to make the drift the audit found structurally impossible
 * to reintroduce. Before F-6, the reports warning cap (200) and the feed cap
 * (50) were two unrelated constants, so the warning could never fire. Before
 * F-9, three modules each carried their own missing-index classifier with
 * subtly different behavior. Both are now single-sourced in activityLogShared;
 * these tests pin the contract.
 */
describe('activityLogShared — F-6 cap parity', () => {
  it('the reports warning cap is the SAME value as the live feed cap', () => {
    // If this ever breaks, the F-6 user-visible bug is back: a garage with
    // more checkouts than the feed cap would see a report that silently
    // omits rows with no "might be incomplete" warning.
    expect(REPORTS_ACTIVITY_LOG_LIMIT).toBe(TODAY_ACTIVITY_LOG_LIMIT);
  });

  it('the feed cap is 50 (the documented visible daily-report cap)', () => {
    // Pinning the value guards against an accidental bump that would silently
    // raise Firestore read costs on every garage device.
    expect(TODAY_ACTIVITY_LOG_LIMIT).toBe(50);
  });
});

describe('activityLogShared — F-9 missing-index classifier', () => {
  it('recognizes the failed-precondition + index-message form', () => {
    const err = Object.assign(new Error('The query requires an index. The required index is missing.'), {
      code: 'failed-precondition'
    });
    expect(isMissingActivityLogIndexError(err)).toBe(true);
  });

  it('recognizes the message-only "missing composite index" form', () => {
    // adminActivityService tests trigger the fallback with this exact message.
    expect(isMissingActivityLogIndexError(new Error('missing composite index'))).toBe(true);
    expect(isMissingActivityLogIndexError(new Error('The query requires an index.'))).toBe(true);
  });

  it('rejects failed-precondition errors that are NOT about indexes', () => {
    const err = Object.assign(new Error('some other precondition'), { code: 'failed-precondition' });
    expect(isMissingActivityLogIndexError(err)).toBe(false);
  });

  it('rejects permission-denied errors (the F-9 silent-degradation fix)', () => {
    // Before F-9, adminActivityService fell back on ANY error, including
    // permission-denied, silently masking real authorization problems.
    const err = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied'
    });
    expect(isMissingActivityLogIndexError(err)).toBe(false);
  });

  it('rejects network errors and falsy inputs', () => {
    expect(isMissingActivityLogIndexError(new Error('network request failed'))).toBe(false);
    expect(isMissingActivityLogIndexError(null)).toBe(false);
    expect(isMissingActivityLogIndexError(undefined)).toBe(false);
    expect(isMissingActivityLogIndexError('string')).toBe(false);
  });
});

describe('activityLogShared — F-9 unavailable error factory', () => {
  it('produces a stable code the caller can branch on', () => {
    const cause = new Error('underlying');
    const err = makeActivityLogUnavailableError(cause);
    expect(err.code).toBe('ACTIVITY_LOGS_UNAVAILABLE');
    expect(err.message).toBe('ACTIVITY_LOGS_UNAVAILABLE');
    expect(err.cause).toBe(cause);
  });
});
