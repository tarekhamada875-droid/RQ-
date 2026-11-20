import crypto from 'node:crypto';

/**
 * Session marker storage — the entity doc's `activeSessionIds` field.
 *
 * SCHEMA MIGRATION (2026-11-19, owner debug-audit finding):
 * The previous schema stored `activeSessionIds: string[]` — bare session IDs
 * with no associated last-active timestamp. Sessions that were abandoned
 * (tab closed, phone died, network failed mid-logout) accumulated in the
 * array forever, because `removeActiveSession` was only called on explicit
 * logout. The owner's debug file showed 25 stale entries on a single-user
 * garage — every `validate-or-refresh-session` heartbeat was scanning all
 * 25, and the entity doc was bloated by ~900 bytes of dead UUIDs.
 *
 * The new schema stores `activeSessionIds: Array<{ sessionId: string,
 * lastActive: string }>` — ISO-datestamped entries. Every write path
 * (claim, release) prunes entries older than SESSION_TIMEOUT_MS (24h,
 * matching the device-session doc timeout). Legacy bare strings are
 * detected on read and treated as `lastActive: epoch` — which is always
 * stale — so they're pruned on the very next claim. This means the very
 * first claim after this fix ships cleans up all accumulated stale
 * entries from before the migration.
 *
 * The `currentSessionId` field on the entity doc is unchanged: it's the
 * most recent session ID, updated on every claim. The pure functions
 * below stop merging it into `activeSessionIds` (the old behavior was a
 * backward-compat shim for a schema that predates `activeSessionIds`).
 */
export type SessionMarkerData = Readonly<{ currentSessionId?: unknown; activeSessionIds?: unknown }>;

export interface SessionMarker {
  sessionId: string;
  lastActive: string; // ISO 8601
}

const MAX_ACTIVE_SESSION_IDS = 100;
export const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h, matches device-session doc timeout

export type SessionSummary = Readonly<{
  id: string;
  isCurrent: boolean;
  isActive: boolean;
  createdAt: string | null;
  lastActive: string | null;
}>;

function serializeTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export function hashSessionId(sessionId: string): string {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

/**
 * Extract session markers from the entity doc's `activeSessionIds` field,
 * accepting BOTH the new schema (`Array<{ sessionId, lastActive }>`) and
 * the legacy schema (`string[]`). Legacy bare strings are stamped with
 * `lastActive: epoch` so write paths can prune them at the next opportunity
 * (the schema migration cleaning up accumulated stale entries).
 *
 * NOTE: the previous implementation also merged `currentSessionId` into
 * the array. That was a backward-compat shim for an older schema that
 * predated `activeSessionIds`. The new schema doesn't need it — every
 * active session is in `activeSessionIds` by definition — so the merge
 * is dropped. `currentSessionId` is still written by the Worker on
 * every claim; it's just no longer double-counted here.
 */
function extractMarkers(data: SessionMarkerData, options: { legacyAsStale?: boolean } = {}): SessionMarker[] {
  const raw = Array.isArray(data.activeSessionIds) ? data.activeSessionIds : [];
  const markers: SessionMarker[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.length > 0) {
      // Legacy schema: bare string. Write paths treat these as stale (epoch
      // lastActive) so they're pruned at the next claim — this is the
      // mechanism that cleans up the 25 accumulated stale entries on the
      // user's garage doc. Read paths treat them as fresh (now) so that
      // hasActiveSession against legacy-seeded test fixtures still returns
      // true. The first WRITE through addActiveSession or removeActiveSession
      // migrates the array to the new schema, and from then on the read
      // path sees real timestamps.
      const lastActive = options.legacyAsStale
        ? new Date(0).toISOString()
        : new Date().toISOString();
      markers.push({ sessionId: entry, lastActive });
    } else if (entry && typeof entry === 'object' && typeof (entry as { sessionId?: unknown }).sessionId === 'string') {
      const e = entry as { sessionId: string; lastActive?: unknown };
      const lastActive = typeof e.lastActive === 'string'
        ? e.lastActive
        : e.lastActive instanceof Date
          ? e.lastActive.toISOString()
          : new Date(0).toISOString();
      markers.push({ sessionId: e.sessionId, lastActive });
    }
  }
  return markers;
}

/**
 * Drop markers whose `lastActive` is older than SESSION_TIMEOUT_MS.
 * Called on every write path so stale entries are pruned at the first
 * opportunity after they expire.
 */
function pruneStale(markers: SessionMarker[], now: number = Date.now()): SessionMarker[] {
  return markers.filter((m) => {
    const t = new Date(m.lastActive).getTime();
    return Number.isFinite(t) && (now - t) < SESSION_TIMEOUT_MS;
  });
}

/**
 * Public read API: return just the sessionIds (without timestamps) from
 * the markers. Treats legacy bare strings as fresh (lastActive=now) so
 * that hasActiveSession against legacy-seeded data still returns true.
 * Stale entries in the NEW schema (objects with old lastActive) ARE
 * pruned — the schema migration cleans up new-schema stale entries on
 * every read.
 *
 * Backward compatible with the old `string[]` return type — callers that
 * only need the IDs (e.g. hasActiveSession checks) don't have to know
 * about the new schema.
 */
export function activeSessionIds(data: SessionMarkerData): string[] {
  return pruneStale(extractMarkers(data, { legacyAsStale: false })).map((m) => m.sessionId);
}

/**
 * Public write API: prune stale entries AND legacy bare strings, then add
 * (or update) the given sessionId with `lastActive: now`. Returns the
 * new-schema marker array (`Array<{ sessionId, lastActive }>`).
 *
 * Pruning legacy strings on write is the schema-migration mechanism: the
 * very first claim after this fix ships cleans up all accumulated stale
 * legacy entries on the entity doc.
 *
 * Callers (workerSessionRoutes.ts claim flow, claim-admin-session flow)
 * write the return value directly to Firestore, so the on-disk schema
 * migrates on the first claim after this fix ships.
 */
export function addActiveSession(data: SessionMarkerData, sessionId: string): SessionMarker[] {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const now = new Date();
  // legacyAsStale=true → bare strings get lastActive=epoch → pruned by pruneStale
  const pruned = pruneStale(extractMarkers(data, { legacyAsStale: true }), now.getTime());
  // If sessionId already exists, replace its lastActive (don't duplicate).
  const without = pruned.filter((m) => m.sessionId !== sessionId);
  return [...without, { sessionId, lastActive: now.toISOString() }].slice(-MAX_ACTIVE_SESSION_IDS);
}

/**
 * Public write API: prune stale entries AND legacy bare strings, then
 * remove the given sessionId. Returns the new-schema marker array.
 */
export function removeActiveSession(data: SessionMarkerData, sessionId: string): SessionMarker[] {
  // legacyAsStale=true → bare strings get lastActive=epoch → pruned by pruneStale
  const pruned = pruneStale(extractMarkers(data, { legacyAsStale: true }));
  return pruned.filter((m) => m.sessionId !== sessionId);
}

/**
 * Public read API: is the given sessionId in the active (non-stale) set?
 * Treats legacy bare strings as fresh (lastActive=now) so this works on
 * legacy-seeded test fixtures. New-schema stale entries ARE pruned.
 */
export function hasActiveSession(data: SessionMarkerData, sessionId: string): boolean {
  return pruneStale(extractMarkers(data, { legacyAsStale: false })).some((m) => m.sessionId === sessionId);
}

export function toSessionSummary(sessionId: string, data: Record<string, unknown>, currentSessionId: string | undefined): SessionSummary {
  return {
    id: hashSessionId(sessionId),
    isCurrent: sessionId === currentSessionId,
    isActive: data.isActive === true,
    createdAt: serializeTimestamp(data.createdAt),
    lastActive: serializeTimestamp(data.lastActive)
  };
}
