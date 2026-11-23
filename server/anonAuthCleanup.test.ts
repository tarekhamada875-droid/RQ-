import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Day 2 of the scale-readiness plan (2026-11-23): nightly cleanup of orphaned
// Firebase Auth anonymous accounts. Tests follow the growthCleanup.test.ts
// pattern: mock adminAuth.listUsers + adminAuth.deleteUser, verify the cron
// self-gates to the daily window, never touches non-anonymous users, and
// never lets a per-user failure abort the whole run.

vi.mock('./firebaseAdmin', () => {
  const adminAuth = {
    listUsers: vi.fn(async (_maxResults: number, _pageToken?: string) => ({
      users: [],
      nextPageToken: undefined,
    })),
    deleteUser: vi.fn(async (_uid: string) => {}),
  };
  return { adminDb: {}, adminAuth };
});
vi.mock('./projections', () => ({
  getCairoDateKey: vi.fn(() => '2026-11-23'),
}));

import { runAnonAuthCleanupOncePerDay, isAnonCleanupWindow, isStaleAnonymousAccount } from './anonAuthCleanup';
import { adminAuth } from './firebaseAdmin';

function atCairo(hour: number, minute: number): Date {
  // Winter Cairo is UTC+2; pick a winter date so the offset is stable.
  return new Date(Date.UTC(2026, 0, 15, hour - 2, minute, 0));
}

describe('anonAuthCleanup — window + decision logic', () => {
  it('isAnonCleanupWindow true only in 04:30–04:34 Cairo', () => {
    expect(isAnonCleanupWindow(atCairo(4, 30))).toBe(true);
    expect(isAnonCleanupWindow(atCairo(4, 32))).toBe(true);
    expect(isAnonCleanupWindow(atCairo(4, 34))).toBe(true);
    expect(isAnonCleanupWindow(atCairo(4, 29))).toBe(false);
    expect(isAnonCleanupWindow(atCairo(4, 35))).toBe(false);
    expect(isAnonCleanupWindow(atCairo(3, 30))).toBe(false);
    expect(isAnonCleanupWindow(atCairo(5, 0))).toBe(false);
    // Important: must NOT collide with growthCleanup (04:00–04:04)
    expect(isAnonCleanupWindow(atCairo(4, 0))).toBe(false);
    expect(isAnonCleanupWindow(atCairo(4, 4))).toBe(false);
  });
});

describe('isStaleAnonymousAccount — pure decision logic', () => {
  const now = new Date('2026-01-15T02:30:00Z'); // matches atCairo(4, 30) on Jan 15 2026
  const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
  const twentyNineDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1001);
  const ms31 = String(thirtyOneDaysAgo.getTime());
  const ms29 = String(twentyNineDaysAgo.getTime());

  it('keeps a user with providerUserInfo (real signed-in user)', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', providerUserInfo: [{ providerId: 'google.com' }], lastLoginAt: ms31 }, now);
    expect(decision.stale).toBe(false);
    expect(decision.reason).toBe('has_provider');
  });

  it('keeps a user with email (real signed-in user)', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', email: 'a@b.c', providerUserInfo: [], lastLoginAt: ms31 }, now);
    expect(decision.stale).toBe(false);
    expect(decision.reason).toBe('has_email_or_phone');
  });

  it('keeps a user with phoneNumber (real signed-in user)', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', phoneNumber: '+201200000000', providerUserInfo: [], lastLoginAt: ms31 }, now);
    expect(decision.stale).toBe(false);
    expect(decision.reason).toBe('has_email_or_phone');
  });

  it('deletes an anonymous user with lastLoginAt older than 30 days', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', providerUserInfo: [], lastLoginAt: ms31 }, now);
    expect(decision.stale).toBe(true);
  });

  it('keeps an anonymous user with lastLoginAt less than 30 days old', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', providerUserInfo: [], lastLoginAt: ms29 }, now);
    expect(decision.stale).toBe(false);
    expect(decision.reason).toBe('too_recent');
  });

  it('keeps an anonymous user with no lastLoginAt (safer than guessing)', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', providerUserInfo: [] }, now);
    expect(decision.stale).toBe(false);
    expect(decision.reason).toBe('no_last_login');
  });

  it('keeps an anonymous user with invalid lastLoginAt (safer than guessing)', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', providerUserInfo: [], lastLoginAt: 'not-a-number' }, now);
    expect(decision.stale).toBe(false);
    expect(decision.reason).toBe('invalid_last_login');
  });

  it('handles numeric lastLoginAt (some clients return numbers)', () => {
    const decision = isStaleAnonymousAccount({ localId: 'u1', providerUserInfo: [], lastLoginAt: thirtyOneDaysAgo.getTime() }, now);
    expect(decision.stale).toBe(true);
  });

  it('rejects invalid user records', () => {
    expect(isStaleAnonymousAccount(null, now)).toEqual({ stale: false, reason: 'invalid_record' });
    expect(isStaleAnonymousAccount(undefined, now)).toEqual({ stale: false, reason: 'invalid_record' });
    expect(isStaleAnonymousAccount('string', now)).toEqual({ stale: false, reason: 'invalid_record' });
  });
});

describe('runAnonAuthCleanupOncePerDay — cron flow', () => {
  // Fixed "now" matching the cron invocation so test dates are deterministic.
  const nowRef = atCairo(4, 30);
  const oldMs = String(nowRef.getTime() - 31 * 24 * 60 * 60 * 1000);
  const recentMs = String(nowRef.getTime() - 5 * 24 * 60 * 60 * 1000);

  beforeEach(() => {
    (adminAuth as any).listUsers.mockClear();
    (adminAuth as any).deleteUser.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('does nothing outside the daily window', async () => {
    const result = await runAnonAuthCleanupOncePerDay(atCairo(13, 0));
    expect(result.ran).toBe(false);
    expect(result.reason).toContain('outside_daily_window');
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect((adminAuth as any).listUsers).not.toHaveBeenCalled();
  });

  it('scans users, deletes stale anonymous ones, keeps the rest', async () => {
    (adminAuth as any).listUsers.mockImplementationOnce(async () => ({
      users: [
        { localId: 'anon-old-1', providerUserInfo: [], lastLoginAt: oldMs }, // stale → delete
        { localId: 'anon-recent', providerUserInfo: [], lastLoginAt: recentMs }, // active → keep
        { localId: 'real-google', providerUserInfo: [{ providerId: 'google.com' }], lastLoginAt: oldMs }, // has provider → keep
        { localId: 'anon-old-2', providerUserInfo: [], lastLoginAt: oldMs }, // stale → delete
        { localId: 'anon-nologin', providerUserInfo: [] }, // no lastLogin → keep (safer)
        { localId: 'anon-old-3', providerUserInfo: [], lastLoginAt: oldMs }, // stale → delete
      ],
      nextPageToken: undefined,
    }));

    const result = await runAnonAuthCleanupOncePerDay(nowRef);

    expect(result.ran).toBe(true);
    expect(result.scanned).toBe(6);
    expect(result.deleted).toBe(3);
    expect(result.skippedActive).toBe(1);
    expect(result.skippedHasProvider).toBe(1);
    expect(result.skippedUnknown).toBe(1);
    expect((adminAuth as any).deleteUser).toHaveBeenCalledTimes(3);
    expect((adminAuth as any).deleteUser).toHaveBeenCalledWith('anon-old-1');
    expect((adminAuth as any).deleteUser).toHaveBeenCalledWith('anon-old-2');
    expect((adminAuth as any).deleteUser).toHaveBeenCalledWith('anon-old-3');
  });

  it('paginates through nextPageToken until exhausted', async () => {
    (adminAuth as any).listUsers
      .mockImplementationOnce(async () => ({
        users: [{ localId: 'page1-anon', providerUserInfo: [], lastLoginAt: oldMs }],
        nextPageToken: 'page2-token',
      }))
      .mockImplementationOnce(async () => ({
        users: [{ localId: 'page2-anon', providerUserInfo: [], lastLoginAt: oldMs }],
        nextPageToken: undefined,
      }));

    const result = await runAnonAuthCleanupOncePerDay(nowRef);

    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(2);
    expect((adminAuth as any).listUsers).toHaveBeenCalledTimes(2);
    // Second call must use the pageToken from the first response.
    const secondCallArgs = (adminAuth as any).listUsers.mock.calls[1];
    expect(secondCallArgs[1]).toBe('page2-token');
  });

  it('never aborts the cron on per-user delete failure', async () => {
    (adminAuth as any).listUsers.mockImplementationOnce(async () => ({
      users: [
        { localId: 'fails', providerUserInfo: [], lastLoginAt: oldMs },
        { localId: 'succeeds', providerUserInfo: [], lastLoginAt: oldMs },
      ],
      nextPageToken: undefined,
    }));
    (adminAuth as any).deleteUser
      .mockRejectedValueOnce(new Error('FIREBASE_AUTH_DELETE_FAILED:500'))
      .mockResolvedValueOnce(undefined);

    const result = await runAnonAuthCleanupOncePerDay(nowRef);

    expect(result.ran).toBe(true);
    expect(result.deleted).toBe(1); // only the second one succeeded
    expect((adminAuth as any).deleteUser).toHaveBeenCalledTimes(2);
  });

  it('never aborts the cron on listUsers failure', async () => {
    (adminAuth as any).listUsers.mockRejectedValueOnce(new Error('FIREBASE_AUTH_LIST_FAILED:500'));

    const result = await runAnonAuthCleanupOncePerDay(nowRef);

    expect(result.ran).toBe(true);
    expect(result.scanned).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.reason).toContain('list_failed');
  });

  it('respects the MAX_DELETE_BATCH cap and leaves the rest for tomorrow', async () => {
    // 200 stale anons in a single page → cap is 100, so 100 left for tomorrow.
    const users = Array.from({ length: 200 }, (_, i) => ({
      localId: `anon-${i}`,
      providerUserInfo: [],
      lastLoginAt: oldMs,
    }));
    (adminAuth as any).listUsers.mockImplementationOnce(async () => ({
      users,
      nextPageToken: undefined,
    }));

    const result = await runAnonAuthCleanupOncePerDay(nowRef);

    expect(result.scanned).toBe(200);
    expect(result.deleted).toBe(100); // MAX_DELETE_BATCH cap
    expect((adminAuth as any).deleteUser).toHaveBeenCalledTimes(100);
  });
});
