// System-config edge cache tests (perf plan 2026-11-21).
// Covers: fallback (no board / no caches), miss → hit transition, auto-sync
// on save, admin-only manual sync endpoint, and read-count savings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockFirestore, mockAdminAuth, installDefaultWorkerTestSessionHeaders } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {},
  isFirebaseAdminInitialized: () => true,
  FieldValue: { increment: (v: number) => ({ __op: 'increment', value: v }) },
}));

import { api } from '../../server/api';
installDefaultWorkerTestSessionHeaders(api, mockDb);
import { PinRateLimiterDurableObject, type PinRateLimiterNamespace } from '../../server/workerPinRateLimiter';
import { getSystemConfigCacheVersion } from '../../server/systemConfigCache';

class MemoryStorage {
  private readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }
}

class MemoryNamespace implements PinRateLimiterNamespace {
  private readonly records = new Map<string, MemoryStorage>();
  idFromName(name: string): string {
    return name;
  }
  get(id: string): { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> } {
    let storage = this.records.get(id);
    if (!storage) {
      storage = new MemoryStorage();
      this.records.set(id, storage);
    }
    const object = new PinRateLimiterDurableObject({ storage });
    return { fetch: (input, init) => object.fetch(new Request(input, init)) };
  }
}

// Minimal stand-in for the Workers `caches.default` global so the vitest
// node environment can exercise the hit path.
class FakeEdgeCache {
  private readonly map = new Map<string, Response>();
  async match(key: RequestInfo | URL): Promise<Response | undefined> {
    const hit = this.map.get(String(key));
    return hit ? hit.clone() : undefined;
  }
  async put(key: RequestInfo | URL, response: Response): Promise<void> {
    this.map.set(String(key), response.clone());
  }
}

const makeEnv = () => ({ PIN_RATE_LIMITER: new MemoryNamespace() } as any);
const GARAGE_AUTH = { Authorization: 'Bearer valid-garage-token-g1' };
const ADMIN_AUTH = { Authorization: 'Bearer valid-admin-token' };

const getConfig = async (env?: any) =>
  api.fetch(new Request('http://localhost/api/system-config', { headers: GARAGE_AUTH }), env);

const readsFor = async (run: () => Promise<Response>) => {
  mockDb.resetDocumentCounts();
  await run();
  return mockDb.documentReadCount;
};

describe('System-config edge cache (owner plan: 30-day TTL + version board)', () => {
  beforeEach(() => mockDb.clear());
  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  it('falls back to a fresh Firestore read when no version board is configured', async () => {
    mockDb.seed('system_config/global', { creditRate: 3 });
    const res = await getConfig(); // no env → no PIN_RATE_LIMITER
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.config.creditRate).toBe(3);
    expect(res.headers.get('x-rq-config-cache')).toBeNull();
  });

  it('serves the second caller from the cache without another config read', async () => {
    (globalThis as { caches?: unknown }).caches = { default: new FakeEdgeCache() };
    const env = makeEnv();
    mockDb.seed('system_config/global', { creditRate: 3 });

    // First-ever GET = MISS: auth reads + the config read.
    const readsMiss = await readsFor(() => getConfig(env));
    const missRes = await getConfig(env);
    expect(missRes.headers.get('x-rq-config-cache')).toBe('hit');
    const missBody = await missRes.json() as any;
    expect(missBody.config.creditRate).toBe(3);

    // A later GET = HIT: auth reads only (session resolution reads are
    // non-increasing thanks to its own cache), so strictly fewer reads.
    const readsHit = await readsFor(() => getConfig(env));
    const hitBody = await (await getConfig(env)).json() as any;
    expect(readsHit).toBeLessThan(readsMiss);
    expect(hitBody).toEqual(missBody);
  });

  it('auto-syncs on save: update-system-config bumps the board and the next reads serve the NEW values', async () => {
    (globalThis as { caches?: unknown }).caches = { default: new FakeEdgeCache() };
    const env = makeEnv();
    mockDb.seed('system_config/global', { creditRate: 1 });
    const ns = env.PIN_RATE_LIMITER;

    await getConfig(env); // warm v0 (creditRate 1)
    const staleHit = await getConfig(env);
    expect(staleHit.headers.get('x-rq-config-cache')).toBe('hit');
    expect((await staleHit.json() as any).config.creditRate).toBe(1);

    const save = await api.fetch(new Request('http://localhost/api/admin/update-system-config', {
      method: 'POST',
      headers: { ...ADMIN_AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ creditRate: 2 }),
    }), env);
    expect(save.status).toBe(200);
    const saveBody = await save.json() as any;
    expect(saveBody.success).toBe(true);
    expect(saveBody.cacheSync).toBe('ok');

    // The board moved: the old v0 copy is now unreachable everywhere.
    expect(await getSystemConfigCacheVersion(ns)).toBe(1);

    // Same colo: eagerly warmed during the save → instant hit with NEW value.
    const sameColo = await getConfig(env);
    expect(sameColo.headers.get('x-rq-config-cache')).toBe('hit');
    expect((await sameColo.json() as any).config.creditRate).toBe(2);

    // A colo that did NOT perform the save (fresh empty edge cache) sees the
    // new version key → MISS → one fresh Firestore read → NEW value.
    (globalThis as { caches?: unknown }).caches = { default: new FakeEdgeCache() };
    const otherColo = await getConfig(env);
    expect(otherColo.headers.get('x-rq-config-cache')).toBe('miss');
    expect((await otherColo.json() as any).config.creditRate).toBe(2);
    const otherColoWarm = await getConfig(env);
    expect(otherColoWarm.headers.get('x-rq-config-cache')).toBe('hit');
  });

  it('manual sync endpoint is admin-only, bumps the board, and re-warms colos with current values', async () => {
    (globalThis as { caches?: unknown }).caches = { default: new FakeEdgeCache() };
    const env = makeEnv();
    mockDb.seed('system_config/global', { paymentWalletNumber: '0100000000' });
    const ns = env.PIN_RATE_LIMITER;

    await getConfig(env);
    expect((await getConfig(env)).headers.get('x-rq-config-cache')).toBe('hit');

    const forbidden = await api.fetch(new Request('http://localhost/api/admin/sync-system-config-cache', {
      method: 'POST',
      headers: GARAGE_AUTH,
    }), env);
    expect(forbidden.status).toBe(403);

    const sync = await api.fetch(new Request('http://localhost/api/admin/sync-system-config-cache', {
      method: 'POST',
      headers: ADMIN_AUTH,
    }), env);
    expect(sync.status).toBe(200);
    const syncBody = await sync.json() as any;
    expect(syncBody.success).toBe(true);
    expect(syncBody.cacheSync).toBe('ok');
    expect(syncBody.config.paymentWalletNumber).toBe('0100000000');

    // The board moved even though the values did not change.
    expect(await getSystemConfigCacheVersion(ns)).toBe(1);

    // Same colo: eagerly re-warmed → instant hit. A fresh colo: MISS →
    // one fresh read, then warm.
    expect((await getConfig(env)).headers.get('x-rq-config-cache')).toBe('hit');
    (globalThis as { caches?: unknown }).caches = { default: new FakeEdgeCache() };
    const otherColo = await getConfig(env);
    expect(otherColo.headers.get('x-rq-config-cache')).toBe('miss');
    expect((await getConfig(env)).headers.get('x-rq-config-cache')).toBe('hit');
  });

  it('falls back to a fresh read when the board is configured but the cache global is missing', async () => {
    // Board present, no `caches` global (e.g. unexpected runtime): must still
    // serve correctly — never break the endpoint because caching is absent.
    mockDb.seed('system_config/global', { creditRate: 5 });
    const res = await getConfig(makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('x-rq-config-cache')).toBeNull();
    expect((await res.json() as any).config.creditRate).toBe(5);
  });
});
