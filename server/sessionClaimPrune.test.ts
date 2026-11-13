import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFirestore } from '../src/__tests__/mockFirestore';
import { claimEntityActiveSessionIds } from './sessionInfrastructure';
import { overflowCandidateIds, isSessionLastActiveStale, STALE_PRUNE_LOOKAHEAD } from './auth/sessionMarkers';

const mockDb = new MockFirestore();

vi.mock('./firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: {
    verifyIdToken: async () => ({ uid: 'prune-test-uid' })
  },
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));

const GID = 'prune-test-garage';
const UID = 'prune-test-uid';
const SESSIONS_ROOT = 'garage_sessions';
const ENTITY_PATH = `garages/${GID}`;

const DAY_MS = 24 * 60 * 60 * 1000;

function sessionList(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

function seedDeviceDocs(ids: string[], lastActive: Date | null): void {
  for (const id of ids) {
    const path = `${SESSIONS_ROOT}/${UID}/sessions/${id}`;
    if (lastActive === null) continue; // missing doc on purpose
    mockDb.seed(path, { sessionId: id, isActive: true, lastActive });
  }
}

describe('claimEntityActiveSessionIds — stale-first pruning on overflow', () => {
  beforeEach(() => {
    mockDb.records.clear();
  });

  it('keeps the legacy behavior (append only, zero device reads) while under the cap', async () => {
    const existing = ['s1', 's2', 's3'];
    const result = await mockDb.runTransaction(async (t: any) =>
      claimEntityActiveSessionIds(t, { activeSessionIds: existing, currentSessionId: 's3' }, 's-new', SESSIONS_ROOT, UID)
    );
    expect(result).toEqual(['s1', 's2', 's3', 's-new']);
    // No device docs were seeded: if the helper had probed any, transaction.get
    // would still succeed but the list must stay untouched — append-only.
  });

  it('prunes stale oldest entries instead of evicting a live device when the list overflows', async () => {
    const stale = sessionList(12, 'stale');        // 12 stale at the front
    const live = sessionList(488, 'live');         // 488 live after them
    const list = [...stale, ...live];              // 500 entries = at the old cap
    mockDb.seed(ENTITY_PATH, { activeSessionIds: list, currentSessionId: list[list.length - 1] });
    seedDeviceDocs(stale, new Date(Date.now() - 2 * DAY_MS));
    seedDeviceDocs(live, new Date());

    const result = await mockDb.runTransaction(async (t: any) =>
      claimEntityActiveSessionIds(t, mockDb.records.get(ENTITY_PATH) || {}, 's-new', SESSIONS_ROOT, UID)
    );

    // Overflow is 1, so only overflow + LOOKAHEAD oldest entries get probed.
    const probed = stale.slice(0, 1 + STALE_PRUNE_LOOKAHEAD);
    for (const id of probed) expect(result, id).not.toContain(id);
    // Everything else survives — including live sessions and the unprobed stale tail.
    expect(result).toContain('s-new');
    expect(result).toContain('live-0');
    expect(result).toContain('live-487');
    expect(result).toContain('stale-11');
    expect(result.length).toBe(500 - probed.length + 1);
  });

  it('still caps the list (last-resort oldest eviction) when every probed entry is live', async () => {
    const live = sessionList(500, 'live');
    mockDb.seed(ENTITY_PATH, { activeSessionIds: live, currentSessionId: live[live.length - 1] });
    seedDeviceDocs(live, new Date());

    const result = await mockDb.runTransaction(async (t: any) =>
      claimEntityActiveSessionIds(t, mockDb.records.get(ENTITY_PATH) || {}, 's-new', SESSIONS_ROOT, UID)
    );

    expect(result.length).toBe(500);
    expect(result).toContain('s-new');
    expect(result).not.toContain('live-0');       // oldest live entry evicted as a last resort
    expect(result).toContain('live-499');         // recent live entries survive
  });

  it('treats a missing device doc as stale and prunes it', async () => {
    const ghost = sessionList(3, 'ghost');        // no device docs seeded at all
    const live = sessionList(497, 'live');
    const list = [...ghost, ...live];             // 500
    mockDb.seed(ENTITY_PATH, { activeSessionIds: list, currentSessionId: live[live.length - 1] });
    seedDeviceDocs(live, new Date());

    const result = await mockDb.runTransaction(async (t: any) =>
      claimEntityActiveSessionIds(t, mockDb.records.get(ENTITY_PATH) || {}, 's-new', SESSIONS_ROOT, UID)
    );

    for (const id of ghost) expect(result, id).not.toContain(id);
    expect(result).toContain('s-new');
    expect(result).toContain('live-0');
    expect(result).toContain('live-496');
  });
});

describe('sessionMarkers pruning helpers', () => {
  it('returns no candidates under the cap', () => {
    expect(overflowCandidateIds({ activeSessionIds: ['a', 'b'] }, 'c')).toEqual([]);
  });

  it('returns overflow + lookahead oldest candidates at the cap', () => {
    const list = sessionList(500, 'x');
    const candidates = overflowCandidateIds({ activeSessionIds: list }, 'x-new');
    expect(candidates.length).toBe(1 + STALE_PRUNE_LOOKAHEAD);
    expect(candidates[0]).toBe('x-0');
  });

  it('detects stale lastActive in Date, ISO string, and Firestore-Timestamp shapes', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS);
    expect(isSessionLastActiveStale(twoDaysAgo)).toBe(true);
    expect(isSessionLastActiveStale(twoDaysAgo.toISOString())).toBe(true);
    expect(isSessionLastActiveStale({ toDate: () => twoDaysAgo })).toBe(true);
    expect(isSessionLastActiveStale(undefined)).toBe(true);
    expect(isSessionLastActiveStale(new Date())).toBe(false);
    expect(isSessionLastActiveStale(new Date().toISOString())).toBe(false);
    expect(isSessionLastActiveStale({ toDate: () => new Date() })).toBe(false);
  });
});
