/**
 * PR-F: auth cache unit tests.
 *
 * Verifies the bounded LRU behavior, TTL expiry, and iat-in-key invalidation
 * for both role and session caches. The caches live in
 * server/authCache.ts and are wired into server/sessionInfrastructure.ts.
 *
 * These are pure unit tests — no Firestore mock needed. They test the cache
 * logic directly, not the wiring (which is covered by the existing auth
 * matrix tests + the MP-1 read-ledger harness).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedRole,
  setCachedRole,
  roleCacheSize,
  getCachedSession,
  setCachedSession,
  sessionCacheSize,
  __resetAllAuthCachesForTests,
  __authCacheStatsForTests,
} from './authCache';
import type { WorkerUser } from './cloudflareWorker';

describe('PR-F: auth cache — role cache', () => {
  beforeEach(() => {
    __resetAllAuthCachesForTests();
  });

  it('returns null on cache miss', () => {
    expect(getCachedRole({ uid: 'user-1', iat: 1000 })).toBeNull();
  });

  it('stores and retrieves a role entry by uid+iat', () => {
    setCachedRole({ uid: 'user-1', iat: 1000 }, { role: 'admin', garageId: null, entityId: 'auth_pin' });
    const entry = getCachedRole({ uid: 'user-1', iat: 1000 });
    expect(entry).not.toBeNull();
    expect(entry!.role).toBe('admin');
    expect(entry!.garageId).toBeNull();
    expect(entry!.entityId).toBe('auth_pin');
  });

  it('treats different iat values as different cache keys (token rotation invalidation)', () => {
    setCachedRole({ uid: 'user-1', iat: 1000 }, { role: 'admin', garageId: null, entityId: 'auth_pin' });
    // Same uid, different iat (token rotated) → cache miss
    expect(getCachedRole({ uid: 'user-1', iat: 2000 })).toBeNull();
    // Original iat still hits
    expect(getCachedRole({ uid: 'user-1', iat: 1000 })).not.toBeNull();
  });

  it('treats different uids as different cache keys', () => {
    setCachedRole({ uid: 'user-1', iat: 1000 }, { role: 'admin', garageId: null, entityId: 'auth_pin' });
    setCachedRole({ uid: 'user-2', iat: 1000 }, { role: 'garage', garageId: 'g1', entityId: 'g1' });
    expect(getCachedRole({ uid: 'user-1', iat: 1000 })!.role).toBe('admin');
    expect(getCachedRole({ uid: 'user-2', iat: 1000 })!.role).toBe('garage');
  });

  it('expires entries after the 5-minute TTL', () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);
      setCachedRole({ uid: 'user-1', iat: 1000 }, { role: 'admin', garageId: null, entityId: 'auth_pin' });
      // Within TTL
      vi.setSystemTime(now + 4 * 60 * 1000); // 4 minutes
      expect(getCachedRole({ uid: 'user-1', iat: 1000 })).not.toBeNull();
      // Past TTL
      vi.setSystemTime(now + 5 * 60 * 1000 + 1); // 5 minutes + 1ms
      expect(getCachedRole({ uid: 'user-1', iat: 1000 })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the LRU entry when at capacity (100 entries)', () => {
    // Fill to capacity
    for (let i = 0; i < 100; i++) {
      setCachedRole({ uid: `user-${i}`, iat: 1000 }, { role: 'garage', garageId: `g${i}`, entityId: `g${i}` });
    }
    expect(roleCacheSize()).toBe(100);
    // Access entry 0 (makes it most-recently-used)
    expect(getCachedRole({ uid: 'user-0', iat: 1000 })).not.toBeNull();
    // Insert one more → should evict user-1 (now least-recently-used)
    setCachedRole({ uid: 'user-100', iat: 1000 }, { role: 'garage', garageId: 'g100', entityId: 'g100' });
    expect(roleCacheSize()).toBe(100);
    // user-1 evicted
    expect(getCachedRole({ uid: 'user-1', iat: 1000 })).toBeNull();
    // user-0 still cached (was accessed recently)
    expect(getCachedRole({ uid: 'user-0', iat: 1000 })).not.toBeNull();
    // user-100 newly cached
    expect(getCachedRole({ uid: 'user-100', iat: 1000 })!.entityId).toBe('g100');
  });
});

describe('PR-F: auth cache — session cache', () => {
  beforeEach(() => {
    __resetAllAuthCachesForTests();
  });

  it('returns null on cache miss', () => {
    expect(getCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 })).toBeNull();
  });

  it('stores and retrieves a session entry by uid+sessionId+iat', () => {
    const user: WorkerUser = {
      uid: 'user-1',
      role: 'garage',
      garageId: 'g1',
      entityId: 'g1',
      displayName: 'Garage One',
    };
    setCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 }, user);
    const entry = getCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 });
    expect(entry).not.toBeNull();
    expect(entry!.user.role).toBe('garage');
    expect(entry!.user.garageId).toBe('g1');
  });

  it('treats different sessionId values as different cache keys', () => {
    const user: WorkerUser = { uid: 'user-1', role: 'garage', garageId: 'g1', entityId: 'g1' };
    setCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 }, user);
    expect(getCachedSession({ uid: 'user-1', sessionId: 'sess-2', iat: 1000 })).toBeNull();
  });

  it('treats different iat values as different cache keys (token rotation invalidation)', () => {
    const user: WorkerUser = { uid: 'user-1', role: 'garage', garageId: 'g1', entityId: 'g1' };
    setCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 }, user);
    expect(getCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 2000 })).toBeNull();
  });

  it('expires entries after the 30-second TTL', () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);
      const user: WorkerUser = { uid: 'user-1', role: 'garage', garageId: 'g1', entityId: 'g1' };
      setCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 }, user);
      // Within TTL
      vi.setSystemTime(now + 29 * 1000); // 29 seconds
      expect(getCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 })).not.toBeNull();
      // Past TTL
      vi.setSystemTime(now + 30 * 1000 + 1); // 30 seconds + 1ms
      expect(getCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts the LRU entry when at capacity (100 entries)', () => {
    const baseUser: WorkerUser = { uid: '', role: 'garage', garageId: '', entityId: '' };
    for (let i = 0; i < 100; i++) {
      setCachedSession({ uid: `user-${i}`, sessionId: `sess-${i}`, iat: 1000 }, { ...baseUser, uid: `user-${i}`, entityId: `e${i}` });
    }
    expect(sessionCacheSize()).toBe(100);
    // Access entry 0 → makes it most-recently-used
    expect(getCachedSession({ uid: 'user-0', sessionId: 'sess-0', iat: 1000 })).not.toBeNull();
    // Insert one more → evicts user-1 (now LRU)
    setCachedSession({ uid: 'user-100', sessionId: 'sess-100', iat: 1000 }, { ...baseUser, uid: 'user-100', entityId: 'e100' });
    expect(sessionCacheSize()).toBe(100);
    expect(getCachedSession({ uid: 'user-1', sessionId: 'sess-1', iat: 1000 })).toBeNull();
    expect(getCachedSession({ uid: 'user-0', sessionId: 'sess-0', iat: 1000 })).not.toBeNull();
    expect(getCachedSession({ uid: 'user-100', sessionId: 'sess-100', iat: 1000 })!.user.entityId).toBe('e100');
  });
});

describe('PR-F: auth cache — stats helper', () => {
  beforeEach(() => {
    __resetAllAuthCachesForTests();
  });

  it('reports cache sizes and TTLs', () => {
    const stats = __authCacheStatsForTests();
    expect(stats.roleCacheSize).toBe(0);
    expect(stats.sessionCacheSize).toBe(0);
    expect(stats.roleCacheTtlMs).toBe(5 * 60 * 1000);
    expect(stats.sessionCacheTtlMs).toBe(30 * 1000);
  });
});
