import crypto from 'node:crypto';

export type SessionMarkerData = Readonly<{ currentSessionId?: unknown; activeSessionIds?: unknown }>;

const MAX_ACTIVE_SESSION_IDS = 500;

/**
 * A session whose device doc has not been refreshed for this long is already
 * dead by the app's own rules (resolveWorkerSessionUser returns SESSION_EXPIRED
 * past this window), so it can be pruned from an entity's activeSessionIds
 * without ever touching a live device.
 */
export const SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/**
 * When the entity's activeSessionIds list overflows, probe this many extra
 * oldest entries beyond the strict overflow count for staleness so one claim
 * can prune a batch of dead sessions instead of evicting a live device.
 */
export const STALE_PRUNE_LOOKAHEAD = 10;

/**
 * Oldest entries that a new claim would need to examine for staleness before
 * any live session may be evicted. Empty when the list is under the cap
 * (the common case: zero extra Firestore reads per claim).
 */
export function overflowCandidateIds(data: SessionMarkerData, incomingSessionId: string): string[] {
  const list = activeSessionIds(data).filter((id) => id !== incomingSessionId);
  const overflow = list.length + 1 - MAX_ACTIVE_SESSION_IDS;
  if (overflow <= 0) return [];
  return list.slice(0, overflow + STALE_PRUNE_LOOKAHEAD);
}

/** True when a device-doc lastActive value is missing or older than the idle timeout. */
export function isSessionLastActiveStale(value: unknown, now = Date.now()): boolean {
  let ms = 0;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === 'number') {
    ms = value;
  } else if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    ms = (value as { toDate: () => Date }).toDate().getTime();
  } else if (typeof value === 'string' || typeof value === 'object') {
    ms = new Date(value as string).getTime();
  }
  return !Number.isFinite(ms) || !ms || now - ms > SESSION_IDLE_TIMEOUT_MS;
}

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

export function activeSessionIds(data: SessionMarkerData): string[] {
  const values = Array.isArray(data.activeSessionIds)
    ? data.activeSessionIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  if (typeof data.currentSessionId === 'string' && data.currentSessionId.length > 0) values.push(data.currentSessionId);
  return [...new Set(values)].slice(-MAX_ACTIVE_SESSION_IDS);
}

export function addActiveSession(data: SessionMarkerData, sessionId: string): string[] {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  return [...new Set([...activeSessionIds(data), sessionId])].slice(-MAX_ACTIVE_SESSION_IDS);
}

export function removeActiveSession(data: SessionMarkerData, sessionId: string): string[] {
  return activeSessionIds(data).filter((value) => value !== sessionId);
}

export function hasActiveSession(data: SessionMarkerData, sessionId: string): boolean {
  return activeSessionIds(data).includes(sessionId);
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
