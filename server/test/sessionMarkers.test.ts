import { describe, expect, it } from 'vitest';
import { activeSessionIds, addActiveSession, hashSessionId, hasActiveSession, removeActiveSession, toSessionSummary, SESSION_TIMEOUT_MS } from '../auth/sessionMarkers';

describe('multi-device session markers', () => {
  it('reads sessionIds from the new schema (Array<{sessionId, lastActive}>)', () => {
    const now = new Date().toISOString();
    const data = { activeSessionIds: [
      { sessionId: 'phone', lastActive: now },
      { sessionId: 'tablet', lastActive: now },
    ] };
    expect(activeSessionIds(data)).toEqual(['phone', 'tablet']);
  });

  it('reads sessionIds from the legacy schema (string[]) for backward compatibility', () => {
    // Legacy bare strings are accepted on READ as fresh (lastActive=now)
    // so existing seed data and test fixtures still work after the schema
    // migration. The first WRITE through addActiveSession or removeActiveSession
    // migrates them to the new schema and prunes them.
    const data = { activeSessionIds: ['legacy_phone', 'legacy_tablet'] };
    expect(activeSessionIds(data)).toEqual(['legacy_phone', 'legacy_tablet']);
    expect(hasActiveSession(data, 'legacy_phone')).toBe(true);
  });

  it('addActiveSession prunes stale entries and stamps lastActive on the new entry', () => {
    const now = new Date();
    const stale = new Date(now.getTime() - SESSION_TIMEOUT_MS - 60_000).toISOString(); // 1min past timeout
    const fresh = new Date(now.getTime() - 60_000).toISOString(); // 1min ago
    const data = { activeSessionIds: [
      { sessionId: 'stale_session', lastActive: stale },
      { sessionId: 'fresh_session', lastActive: fresh },
    ] };

    const result = addActiveSession(data, 'new_session');

    // Stale entry pruned, fresh entry preserved, new entry appended with lastActive ~= now
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.sessionId)).toEqual(['fresh_session', 'new_session']);
    // New entry's lastActive is "now" (within a 5s tolerance for test latency)
    const newEntry = result.find((m) => m.sessionId === 'new_session')!;
    expect(newEntry.lastActive).toBeTruthy();
    expect(Date.now() - new Date(newEntry.lastActive).getTime()).toBeLessThan(5_000);
  });

  it('addActiveSession updates lastActive when the same sessionId is re-claimed (no duplicate)', () => {
    const stale = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(); // 3h ago
    const data = { activeSessionIds: [{ sessionId: 'recurring', lastActive: stale }] };

    const result = addActiveSession(data, 'recurring');

    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('recurring');
    // lastActive was bumped to "now"
    expect(Date.now() - new Date(result[0].lastActive).getTime()).toBeLessThan(5_000);
  });

  it('removeActiveSession prunes stale entries and removes the requested sessionId', () => {
    const stale = new Date(Date.now() - SESSION_TIMEOUT_MS - 60_000).toISOString();
    const fresh = new Date(Date.now() - 60_000).toISOString();
    const data = { activeSessionIds: [
      { sessionId: 'stale', lastActive: stale },
      { sessionId: 'fresh_a', lastActive: fresh },
      { sessionId: 'fresh_b', lastActive: fresh },
    ] };

    const result = removeActiveSession(data, 'fresh_a');

    // Stale entry pruned, requested entry removed, other fresh entry preserved
    expect(result.map((m) => m.sessionId)).toEqual(['fresh_b']);
  });

  it('hasActiveSession returns true for fresh entries, false for stale or missing', () => {
    const stale = new Date(Date.now() - SESSION_TIMEOUT_MS - 60_000).toISOString();
    const fresh = new Date(Date.now() - 60_000).toISOString();
    const data = { activeSessionIds: [
      { sessionId: 'stale', lastActive: stale },
      { sessionId: 'fresh', lastActive: fresh },
    ] };

    expect(hasActiveSession(data, 'fresh')).toBe(true);
    expect(hasActiveSession(data, 'stale')).toBe(false); // pruned by hasActiveSession's internal prune
    expect(hasActiveSession(data, 'missing')).toBe(false);
  });

  it('bounds the active-session marker to prevent unbounded account-document growth', () => {
    const now = new Date().toISOString();
    const ids = addActiveSession({ activeSessionIds: Array.from({ length: 100 }, (_, index) => ({ sessionId: `session-${index}`, lastActive: now })) }, 'session-100');
    expect(ids).toHaveLength(100);
    expect(ids.at(-1)!.sessionId).toBe('session-100');
    expect(ids.map((m) => m.sessionId)).not.toContain('session-0');
  });

  it('SCHEMA-MIGRATION (2026-11-19): legacy bare strings are pruned on first WRITE — fixes the 25-stale-sessions bug', () => {
    // The owner's debug file showed 25 legacy bare-string entries on a single
    // garage doc. The fix: write paths treat legacy strings as lastActive=epoch
    // (stale), so they're pruned at the next claim. The first claim after this
    // fix ships cleans up all 25. Read paths treat legacy strings as fresh so
    // existing seed data still works until the first write migrates it.
    const data = { activeSessionIds: [
      'stale_1', 'stale_2', 'stale_3', 'stale_4', 'stale_5',
      'stale_6', 'stale_7', 'stale_8', 'stale_9', 'stale_10',
      'stale_11', 'stale_12', 'stale_13', 'stale_14', 'stale_15',
      'stale_16', 'stale_17', 'stale_18', 'stale_19', 'stale_20',
      'stale_21', 'stale_22', 'stale_23', 'stale_24', 'stale_25',
    ] };

    // READ: legacy strings treated as fresh — they appear in the read result
    expect(activeSessionIds(data)).toHaveLength(25);

    // WRITE: legacy strings pruned (treated as stale), only fresh entry remains
    const result = addActiveSession(data, 'fresh_session');
    expect(result).toHaveLength(1);
    expect(result[0].sessionId).toBe('fresh_session');
    // None of the stale session IDs survived into the new array
    for (const m of result) {
      expect(m.sessionId.startsWith('stale_')).toBe(false);
    }
  });

  it('SCHEMA-MIGRATION (2026-11-19): mixed legacy + new-schema entries — legacy pruned, new preserved', () => {
    const stale = new Date(Date.now() - SESSION_TIMEOUT_MS - 60_000).toISOString();
    const fresh = new Date().toISOString();
    const data = { activeSessionIds: [
      'legacy_bare_string',                        // legacy → pruned (epoch lastActive)
      { sessionId: 'old_object', lastActive: stale }, // new schema, stale → pruned
      { sessionId: 'fresh_object', lastActive: fresh }, // new schema, fresh → preserved
    ] };

    const result = addActiveSession(data, 'new_session');

    expect(result.map((m) => m.sessionId)).toEqual(['fresh_object', 'new_session']);
  });

  it('exposes only a one-way session identifier and safe timestamps', () => {
    const summary = toSessionSummary('session-secret', {
      isActive: true,
      createdAt: new Date('2026-09-22T10:00:00.000Z'),
      lastActive: new Date('2026-09-22T10:05:00.000Z'),
      uid: 'uid-secret',
      displayName: 'Private User'
    }, 'session-secret');

    expect(summary).toEqual({
      id: hashSessionId('session-secret'),
      isCurrent: true,
      isActive: true,
      createdAt: '2026-09-22T10:00:00.000Z',
      lastActive: '2026-09-22T10:05:00.000Z'
    });
    expect(JSON.stringify(summary)).not.toContain('session-secret');
    expect(JSON.stringify(summary)).not.toContain('uid-secret');
  });
});
