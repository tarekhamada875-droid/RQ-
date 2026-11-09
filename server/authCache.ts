/**
 * PR-F: Worker in-memory auth caches.
 *
 * Per supervisor FINAL SEQUENCE: "Worker auth caches (role 5-min TTL +
 * session 30s TTL, bounded+pruning, iat in key); 保留 useGarageSession.ts:88-91
 * auth-timeout fallback".
 *
 * Two caches:
 *   - roleCache: keyed by `${uid}:${iat}` (token issue time, so token
 *     rotation invalidates). Stores { role, garageId, entityId }.
 *     TTL: 5 minutes. Max size: 100 (LRU eviction when full).
 *   - sessionCache: keyed by `${uid}:${sessionId}:${iat}`. Stores the
 *     full WorkerUser plus the resolvedAt timestamp.
 *     TTL: 30 seconds. Max size: 100 (LRU eviction when full).
 *
 * "iat in key" requirement: the cache key includes the token's `iat`
 * (issued-at, Unix seconds) claim. When a client rotates their token
 * (Firebase ID tokens rotate hourly), the new iat produces a new key —
 * so the cache cannot serve stale data from a previous token. The cache
 * value is role/session info that doesn't change with token rotation,
 * but the key includes iat as a defensive invalidation boundary.
 *
 * "Bounded + pruning": both caches enforce a max size of 100 entries.
 * When full, the least-recently-used entry is evicted before insertion.
 * Periodic pruning of expired entries happens lazily on read/insert.
 *
 * Per-isolate scope: this is a module-level in-memory Map. Cloudflare
 * Workers run multiple isolates; each isolate has its own cache. This
 * means a token may miss the cache on its first request to a given
 * isolate but hit on subsequent requests to that isolate. That's
 * acceptable for our budget: even a 50% hit rate halves the auth reads.
 *
 * No KV per supervisor standing rules. Cache lives in isolate memory
 * only; lost on isolate restart. Worst case = a few extra reads after
 * a cold start; never an inconsistency.
 *
 * Client-side auth-timeout fallback (useGarageSession.ts:88-91): NOT
 * touched. PR-F is server-side only.
 */

import type { WorkerUser } from './cloudflareWorker';

// ── Constants ──────────────────────────────────────────────────────────
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_CACHE_TTL_MS = 30 * 1000; // 30 seconds
const ROLE_CACHE_MAX_SIZE = 100;
const SESSION_CACHE_MAX_SIZE = 100;

// ── Role cache ─────────────────────────────────────────────────────────
interface RoleCacheEntry {
  role: string;
  garageId: string | null;
  entityId: string;
  cachedAt: number;
}

const roleCache = new Map<string, RoleCacheEntry>();

export interface RoleCacheKey {
  uid: string;
  iat: number;
}

function roleCacheKeyString(key: RoleCacheKey): string {
  return `${key.uid}:${key.iat}`;
}

export function getCachedRole(key: RoleCacheKey): RoleCacheEntry | null {
  const k = roleCacheKeyString(key);
  const entry = roleCache.get(k);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ROLE_CACHE_TTL_MS) {
    roleCache.delete(k);
    return null;
  }
  // Move-to-end for LRU semantics (Map preserves insertion order; delete+set
  // moves the entry to the end, marking it most-recently-used).
  roleCache.delete(k);
  roleCache.set(k, entry);
  return entry;
}

export function setCachedRole(key: RoleCacheKey, value: Omit<RoleCacheEntry, 'cachedAt'>): void {
  const k = roleCacheKeyString(key);
  // Bounded: evict LRU when at capacity.
  if (roleCache.size >= ROLE_CACHE_MAX_SIZE && !roleCache.has(k)) {
    const lruKey = roleCache.keys().next().value;
    if (lruKey) roleCache.delete(lruKey);
  }
  roleCache.set(k, { ...value, cachedAt: Date.now() });
}

export function clearRoleCache(): void {
  roleCache.clear();
}

export function roleCacheSize(): number {
  return roleCache.size;
}

// ── Session cache ─────────────────────────────────────────────────────
interface SessionCacheEntry {
  user: WorkerUser;
  cachedAt: number;
}

const sessionCache = new Map<string, SessionCacheEntry>();

export interface SessionCacheKey {
  uid: string;
  sessionId: string;
  iat: number;
}

function sessionCacheKeyString(key: SessionCacheKey): string {
  return `${key.uid}:${key.sessionId}:${key.iat}`;
}

export function getCachedSession(key: SessionCacheKey): SessionCacheEntry | null {
  const k = sessionCacheKeyString(key);
  const entry = sessionCache.get(k);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > SESSION_CACHE_TTL_MS) {
    sessionCache.delete(k);
    return null;
  }
  // Move-to-end for LRU semantics.
  sessionCache.delete(k);
  sessionCache.set(k, entry);
  return entry;
}

export function setCachedSession(key: SessionCacheKey, user: WorkerUser): void {
  const k = sessionCacheKeyString(key);
  // Bounded: evict LRU when at capacity.
  if (sessionCache.size >= SESSION_CACHE_MAX_SIZE && !sessionCache.has(k)) {
    const lruKey = sessionCache.keys().next().value;
    if (lruKey) sessionCache.delete(lruKey);
  }
  sessionCache.set(k, { user, cachedAt: Date.now() });
}

export function clearSessionCache(): void {
  sessionCache.clear();
}

export function sessionCacheSize(): number {
  return sessionCache.size;
}

// ── Test-only helpers (not exported to production code paths) ─────────
// These let tests reset the cache between runs to ensure determinism.
export function __resetAllAuthCachesForTests(): void {
  roleCache.clear();
  sessionCache.clear();
}

export function __authCacheStatsForTests(): {
  roleCacheSize: number;
  sessionCacheSize: number;
  roleCacheTtlMs: number;
  sessionCacheTtlMs: number;
} {
  return {
    roleCacheSize: roleCache.size,
    sessionCacheSize: sessionCache.size,
    roleCacheTtlMs: ROLE_CACHE_TTL_MS,
    sessionCacheTtlMs: SESSION_CACHE_TTL_MS,
  };
}
