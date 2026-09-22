export type SessionMarkerData = Readonly<{ currentSessionId?: unknown; activeSessionIds?: unknown }>;

const MAX_ACTIVE_SESSION_IDS = 100;

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
