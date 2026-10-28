import { apiFetch } from '../api/apiClient';

export interface ActiveSession {
  id: string;
  isCurrent: boolean;
  isActive: boolean;
  createdAt: string | null;
  lastActive: string | null;
}

interface SessionListResponse {
  success: boolean;
  sessions: ActiveSession[];
}

interface SessionRevokeResponse {
  success: boolean;
  revokedSession: string;
  wasCurrent: boolean;
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  const response = await apiFetch<SessionListResponse>('/api/auth/sessions');
  if (!response || response.success !== true || !Array.isArray(response.sessions)) {
    throw new Error('SESSION_LIST_INVALID_RESPONSE');
  }
  return response.sessions;
}

export async function revokeActiveSession(sessionKey: string): Promise<SessionRevokeResponse> {
  if (!/^[a-f0-9]{64}$/.test(sessionKey)) {
    throw new Error('INVALID_SESSION_KEY');
  }
  const response = await apiFetch<SessionRevokeResponse>(`/api/auth/sessions/${sessionKey}`, { method: 'DELETE' });
  if (!response || response.success !== true || response.revokedSession !== sessionKey) {
    throw new Error('SESSION_REVOKE_INVALID_RESPONSE');
  }
  return response;
}

export const sessionService = {
  listActiveSessions,
  revokeActiveSession
};
