import { describe, expect, it } from 'vitest';
import { activeSessionIds, addActiveSession, hashSessionId, hasActiveSession, removeActiveSession, toSessionSummary } from '../auth/sessionMarkers';

describe('multi-device session markers', () => {
  it('merges the legacy marker with active device sessions without duplicates', () => {
    expect(activeSessionIds({ currentSessionId: 'legacy', activeSessionIds: ['phone', 'legacy', 'phone'] })).toEqual(['phone', 'legacy']);
    expect(addActiveSession({ currentSessionId: 'legacy', activeSessionIds: ['phone'] }, 'tablet')).toEqual(['phone', 'legacy', 'tablet']);
  });

  it('revokes only the requested device and preserves other sessions', () => {
    const data = { currentSessionId: 'tablet', activeSessionIds: ['phone', 'tablet'] };
    expect(hasActiveSession(data, 'phone')).toBe(true);
    expect(removeActiveSession(data, 'phone')).toEqual(['tablet']);
    expect(hasActiveSession({ activeSessionIds: ['tablet'] }, 'phone')).toBe(false);
  });

  it('bounds the active-session marker to prevent unbounded account-document growth', () => {
    const ids = addActiveSession({ activeSessionIds: Array.from({ length: 100 }, (_, index) => `session-${index}`) }, 'session-100');
    expect(ids).toHaveLength(100);
    expect(ids.at(-1)).toBe('session-100');
    expect(ids).not.toContain('session-0');
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
