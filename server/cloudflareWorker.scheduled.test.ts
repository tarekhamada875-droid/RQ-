import { afterEach, describe, expect, it, vi } from 'vitest';

// The growth cleanup (audit 2026-11-21) piggybacks on the scheduled handler.
// Its Firebase calls are inert here — the keep-warm tests pin the clock to a
// time OUTSIDE the cleanup's once-a-day Cairo window (04:00-04:04) so the
// assertions stay deterministic; the in-window behavior is covered by
// growthCleanup.test.ts and the dedicated in-window test below.
vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    collection: vi.fn(() => {
      const query: any = { where: vi.fn(() => query), limit: vi.fn(() => query), get: vi.fn(async () => ({ empty: true, docs: [] })) };
      return query;
    }),
    batch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(async () => undefined) })),
    doc: vi.fn((path: string) => ({ path }))
  },
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }), delete: () => ({ __op: 'delete' }) }
}));

import { scheduled } from './cloudflareWorker';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SELF_URL = 'https://rq.tarekhamada875.workers.dev';

describe('keep-warm scheduled handler', () => {
  it('self-pings /api/version when WORKER_SELF_URL is configured', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();

    // Pinned to Cairo 13:30 — far outside the 04:00-04:04 cleanup window.
    await scheduled({}, { WORKER_SELF_URL: SELF_URL }, { waitUntil }, new Date(Date.UTC(2026, 0, 15, 11, 30)));

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await (waitUntil.mock.calls[0] as unknown as [Promise<void>])[0];
    expect(fetchMock).toHaveBeenCalledWith(`${SELF_URL}/api/version`, {
      headers: { 'x-rq-keep-warm': '1' }
    });
  });

  it('does nothing when WORKER_SELF_URL is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();

    await scheduled({}, {}, { waitUntil });

    expect(waitUntil).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows ping failures so cron runs never error', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();

    await scheduled({}, { WORKER_SELF_URL: SELF_URL }, { waitUntil });

    // The waitUntil promise is guarded internally: resolving it must not throw.
    await expect((waitUntil.mock.calls[0] as unknown as [Promise<void>])[0]).resolves.toBeUndefined();
  });
});

describe('growth cleanup piggyback (audit 2026-11-21)', () => {
  it('waits on the cleanup when the pinned time is inside the daily window', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn(async (promise: Promise<unknown>) => { await promise; });
    // Pinned to Cairo 04:02 (UTC 02:02 in winter) — inside 04:00-04:04.
    const inWindow = new Date(Date.UTC(2026, 0, 15, 2, 2));

    await scheduled({}, { WORKER_SELF_URL: SELF_URL }, { waitUntil }, inWindow);

    expect(waitUntil).toHaveBeenCalledTimes(2);
  });
});
