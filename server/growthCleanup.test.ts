import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Audit regression (2026-11-21): idempotency_records and deactivated
// session_index documents were written forever — the database grows without
// bound. runGrowthCleanupOncePerDay deletes expired idempotency records and
// long-dead session index entries, self-gated to a once-a-day Cairo window
// (the cron fires every minute), with hard page bounds and a never-touch-
// live-sessions guarantee.

vi.mock('./firebaseAdmin', () => {
  const calls: any = { queries: [], batches: [] };
  const makeSnap = (docs: any[]) => ({
    empty: docs.length === 0,
    docs: docs.map((d: any) => ({ id: d.id, data: () => d.data, ref: { path: `x/${d.id}` } }))
  });
  const adminDb = {
    collection: vi.fn((path: string) => {
      const query: any = {
        where: vi.fn(() => query),
        limit: vi.fn(() => query),
        get: vi.fn(async () => {
          calls.queries.push(path);
          const family = path === 'idempotency_records'
            ? (calls.idempotencyPages?.shift() || [])
            : (calls.sessionPages?.shift() || []);
          return makeSnap(family);
        })
      };
      return query;
    }),
    batch: vi.fn(() => {
      const batch = {
        deletes: [] as string[],
        delete: vi.fn((ref: any) => batch.deletes.push(ref.path)),
        commit: vi.fn(async () => { calls.batches.push(batch.deletes.slice()); })
      };
      return batch;
    }),
    doc: vi.fn((path: string) => ({ path })),
    __calls: calls
  };
  return { adminDb };
});
vi.mock('./projections', () => ({
  getCairoDateKey: vi.fn(() => '2026-11-21')
}));

import { runGrowthCleanupOncePerDay } from './growthCleanup';
import { adminDb } from './firebaseAdmin';

const calls = (adminDb as any).__calls;

function atCairo(hour: number, minute: number): Date {
  // The helper formats with Africa/Cairo; construct a UTC time that maps to
  // the requested Cairo wall clock in winter (UTC+2).
  return new Date(Date.UTC(2026, 0, 15, hour - 2, minute, 0));
}

describe('growthCleanup — once-a-day record deletion (audit 2026-11-21)', () => {
  beforeEach(() => {
    calls.queries.length = 0;
    calls.batches.length = 0;
    calls.idempotencyPages = [];
    calls.sessionPages = [];
  });
  afterEach(() => vi.clearAllMocks());

  it('does nothing outside the daily Cairo window', async () => {
    const result = await runGrowthCleanupOncePerDay(atCairo(13, 30));
    expect(result.ran).toBe(false);
    expect(result.reason).toContain('outside_daily_window');
    expect(calls.queries).toHaveLength(0);
  });

  it('deletes expired idempotency records in bounded pages', async () => {
    // A short page means the query is exhausted, so a second page only
    // happens after a FULL (450-doc) first page.
    calls.idempotencyPages = [
      Array.from({ length: 450 }, (_, index) => ({ id: `doc-${index}`, data: {} })),
      [{ id: 'last', data: {} }],
      // third page returns empty → loop stops
    ];
    calls.sessionPages = [[]];

    const result = await runGrowthCleanupOncePerDay(atCairo(4, 3));

    expect(result.ran).toBe(true);
    expect(result.idempotencyDeleted).toBe(451);
    expect(result.sessionIndexDeleted).toBe(0);
    expect(calls.batches).toHaveLength(2);
    expect(calls.batches[1]).toEqual(['x/last']);
  });

  it('never deletes active session_index entries', async () => {
    calls.idempotencyPages = [[]];
    calls.sessionPages = [
      [
        { id: 'dead-1', data: { isActive: false } },
        { id: 'alive', data: { isActive: true } },
        { id: 'dead-2', data: { isActive: undefined } }
      ]
    ];

    const result = await runGrowthCleanupOncePerDay(atCairo(4, 0));

    expect(result.ran).toBe(true);
    expect(result.sessionIndexDeleted).toBe(2);
    expect(calls.batches[0]).toEqual(['x/dead-1', 'x/dead-2']);
  });
});
