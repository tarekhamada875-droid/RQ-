// System-config edge cache (perf, owner-approved plan 2026-11-21).
//
// OWNER'S PROBLEM: GET /api/system-config returns the SAME answer for every
// authenticated caller (creditRate, paymentWalletNumber, adminColor), yet the
// Worker read Firestore on every single call. Every garage opening the pricing
// view, every admin screen mount — one full Worker + Firestore round trip for
// an answer shared by all users.
//
// OWNER-APPROVED DESIGN (chat 2026-11-21):
//   1. Cache the response for 30 days per cache key (owner picked 1 month —
//      "these values will not change every minute").
//   2. The cache key embeds a VERSION number stored in the Durable Object
//      "version board" (see workerPinRateLimiter.ts SYSTEM_CONFIG_VERSION_BUCKET).
//      All colos derive their key from that board, so bumping the version
//      invalidates every colo's copy IMMEDIATELY (DO reads are strongly
//      consistent — no propagation delay like KV).
//   3. POST /api/admin/update-system-config bumps the version automatically
//      after a successful save, so admin changes reach all devices on their
//      next fetch — the button is a safety hatch, not the primary path.
//   4. POST /api/admin/sync-system-config-cache = the owner's "sync now"
//      button (dedicated admin settings page): bump + eagerly warm this
//      colo's copy so even the pressing colo is fresh.
//
// OWNER'S QUOTA MATH (his words: "I need those reads for the garages"): with
// a 30-day TTL the config costs ~1 Firestore read per colo per month instead
// of one per request. Money math is UNAFFECTED: server-side billing paths
// (e.g. creditGrantRoutes.ts) read system_config/global FRESH inside their
// transactions — staleness only ever affects what a phone DISPLAYS.
//
// SAFETY FALLBACKS (no cache, no DO, or any internal error → behave exactly
// like the pre-cache implementation: one fresh Firestore read per request).

import type { PinRateLimiterNamespace } from './workerPinRateLimiter';
import { SYSTEM_CONFIG_VERSION_BUCKET } from './workerPinRateLimiter';
import { adminDb } from './firebaseAdmin';

const ACTIVE_SYSTEM_CONFIG_FIELDS = ['adminColor', 'paymentWalletNumber', 'creditRate'] as const;

const DEFAULT_SYSTEM_CONFIG = {
  adminColor: '#10b981',
  paymentWalletNumber: '',
  creditRate: 1
};

export function projectSystemConfig(config: Record<string, any>): Record<string, any> {
  const projected: Record<string, any> = {};
  for (const field of ACTIVE_SYSTEM_CONFIG_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(config, field)) projected[field] = config[field];
  }
  return projected;
}

// Owner's pick (2026-11-21): 1 month. This is a BACKSTOP only — correctness
// comes from version bumping. If the version board ever became unreachable
// (Cloudflare outage), worst-case staleness is bounded by this TTL.
export const SYSTEM_CONFIG_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

const CACHE_KEY_PREFIX = 'https://rq-system-config-cache.internal/v';

function getNamespace(c: { env?: { PIN_RATE_LIMITER?: PinRateLimiterNamespace } }): PinRateLimiterNamespace | null {
  const ns = c.env?.PIN_RATE_LIMITER;
  if (!ns || typeof ns.idFromName !== 'function' || typeof ns.get !== 'function') return null;
  return ns;
}

function getCache(): Cache | null {
  // vitest / non-Workers runtimes have no caches global → callers fall back.
  const cachesRef = (globalThis as { caches?: { default?: Cache } }).caches;
  return cachesRef?.default ?? null;
}

async function callVersionBoard(ns: PinRateLimiterNamespace, action: 'config_version_get' | 'config_version_bump'): Promise<number | null> {
  try {
    const stub = ns.get(ns.idFromName(SYSTEM_CONFIG_VERSION_BUCKET));
    const res = await stub.fetch(`https://pin-rate-limiter/${SYSTEM_CONFIG_VERSION_BUCKET}`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    if (!res.ok) return null;
    const data = await res.json() as { version?: unknown };
    return typeof data.version === 'number' && Number.isFinite(data.version) ? data.version : null;
  } catch {
    return null;
  }
}

export async function getSystemConfigCacheVersion(ns: PinRateLimiterNamespace): Promise<number | null> {
  return callVersionBoard(ns, 'config_version_get');
}

export async function bumpSystemConfigCacheVersion(ns: PinRateLimiterNamespace): Promise<number | null> {
  return callVersionBoard(ns, 'config_version_bump');
}

async function buildConfigBody(): Promise<{ success: true; config: Record<string, any> }> {
  const snap = await adminDb.doc('system_config/global').get();
  if (!snap.exists) {
    return { success: true, config: { ...DEFAULT_SYSTEM_CONFIG } };
  }
  const activeConfig = projectSystemConfig(snap.data() || {});
  return { success: true, config: { ...DEFAULT_SYSTEM_CONFIG, ...activeConfig } };
}

function jsonHeaders(extra: Record<string, string> = {}): Headers {
  const headers = new Headers({ 'content-type': 'application/json' });
  // Client-facing responses are never browser-cached: freshness is governed
  // by the version board, and a browser-cached copy would defeat it.
  headers.set('cache-control', 'no-store');
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return headers;
}

/**
 * Fresh (uncached) read — identical to the pre-cache implementation.
 */
export async function loadSystemConfigFresh(c: { json: (body: unknown) => Response }): Promise<Response> {
  const body = await buildConfigBody();
  return c.json(body);
}

/**
 * GET /api/system-config handler: version-keyed edge cache with fallbacks.
 */
export async function loadSystemConfigCached(
  c: {
    env?: { PIN_RATE_LIMITER?: PinRateLimiterNamespace };
    json: (body: unknown) => Response;
  }
): Promise<Response> {
  const ns = getNamespace(c);
  const cache = getCache();
  if (!ns || !cache) {
    return loadSystemConfigFresh(c);
  }
  try {
    const version = await getSystemConfigCacheVersion(ns);
    if (version === null) {
      return loadSystemConfigFresh(c);
    }
    const key = `${CACHE_KEY_PREFIX}${version}`;
    const cached = await cache.match(key);
    if (cached) {
      const text = await cached.text();
      return new Response(text, { status: 200, headers: jsonHeaders({ 'x-rq-config-cache': 'hit' }) });
    }
    const body = await buildConfigBody();
    // The cached ENTRY carries the long TTL; the response to the CLIENT
    // carries no-store (see jsonHeaders) so browser caches never bypass
    // the version board.
    const entry = new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${SYSTEM_CONFIG_CACHE_TTL_SECONDS}` }
    });
    await cache.put(key, entry);
    return new Response(JSON.stringify(body), { status: 200, headers: jsonHeaders({ 'x-rq-config-cache': 'miss' }) });
  } catch (err) {
    console.warn('[systemConfigCache] cache path failed, serving fresh:', err);
    return loadSystemConfigFresh(c);
  }
}

/**
 * Owner's "sync now" action + the automatic post-save sync:
 * bump the version board, then eagerly fetch + store the fresh body under
 * the NEW key so the colo that handled the bump is already warm (every
 * other colo warms itself on its next request — one Firestore read each).
 */
export async function syncSystemConfigCache(
  c: {
    env?: { PIN_RATE_LIMITER?: PinRateLimiterNamespace };
    json: (body: unknown) => Response;
  }
): Promise<Response> {
  const ns = getNamespace(c);
  if (!ns) {
    // No version board → nothing is cached anywhere → everything is
    // already fresh by definition.
    const body = await buildConfigBody();
    return c.json({ ...body, cacheSync: 'not_configured' });
  }
  const version = await bumpSystemConfigCacheVersion(ns);
  if (version === null) {
    console.warn('[systemConfigCache] version bump failed — copies stay until TTL or manual retry');
    const body = await buildConfigBody();
    return c.json({ ...body, cacheSync: 'failed' });
  }
  try {
    const cache = getCache();
    if (cache) {
      const body = await buildConfigBody();
      const entry = new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${SYSTEM_CONFIG_CACHE_TTL_SECONDS}` }
      });
      await cache.put(`${CACHE_KEY_PREFIX}${version}`, entry);
      return c.json({ ...body, cacheSync: 'ok' });
    }
    const body = await buildConfigBody();
    return c.json({ ...body, cacheSync: 'ok' });
  } catch (err) {
    console.warn('[systemConfigCache] eager warm failed (colos will self-warm):', err);
    return loadSystemConfigFresh(c);
  }
}
