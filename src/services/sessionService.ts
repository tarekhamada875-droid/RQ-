import { apiCall } from '../api/apiCall';

export interface ActiveSession {
  id: string;
  isCurrent: boolean;
  isActive: boolean;
  createdAt: string | null;
  lastActive: string | null;
}

interface SessionRevokeResponse {
  revokedSession: string;
  wasCurrent: boolean;
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  const res = await apiCall<{ sessions: ActiveSession[] }>('/api/auth/sessions');
  return Array.isArray(res?.sessions) ? res.sessions : [];
}

export async function revokeActiveSession(sessionKey: string): Promise<SessionRevokeResponse> {
  if (!/^[a-f0-9]{64}$/.test(sessionKey)) {
    throw new Error('INVALID_SESSION_KEY');
  }
  return apiCall<SessionRevokeResponse>(`/api/auth/sessions/${sessionKey}`, { method: 'DELETE' });
}

export const sessionService = {
  listActiveSessions,
  revokeActiveSession
};
