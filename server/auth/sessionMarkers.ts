import crypto from 'node:crypto';

export type SessionMarkerData = Readonly<{ currentSessionId?: unknown; activeSessionIds?: unknown }>;

const MAX_ACTIVE_SESSION_IDS = 100;

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
