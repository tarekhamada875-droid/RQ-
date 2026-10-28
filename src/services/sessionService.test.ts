import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/apiClient';
import { listActiveSessions, revokeActiveSession } from './sessionService';

vi.mock('../api/apiClient', () => ({
  apiFetch: vi.fn()
}));

const mockedApiFetch = vi.mocked(apiFetch);
const sessionKey = 'a'.repeat(64);

beforeEach(() => {
  mockedApiFetch.mockReset();
});

describe('sessionService', () => {
  it('lists active sessions only when the response shape is valid', async () => {
    const sessions = [{
      id: sessionKey,
      isCurrent: true,
      isActive: true,
      createdAt: '2026-09-23T05:00:00.000Z',
      lastActive: '2026-09-23T05:10:00.000Z'
    }];
    mockedApiFetch.mockResolvedValue({ success: true, sessions });

    await expect(listActiveSessions()).resolves.toEqual(sessions);
    expect(mockedApiFetch).toHaveBeenCalledWith('/api/auth/sessions');
  });

  it('rejects malformed session-list responses', async () => {
    mockedApiFetch.mockResolvedValue({ success: true, sessions: 'not-an-array' });

    await expect(listActiveSessions()).rejects.toThrow('SESSION_LIST_INVALID_RESPONSE');
  });

  it('revokes a valid opaque session key with DELETE', async () => {
    mockedApiFetch.mockResolvedValue({ success: true, revokedSession: sessionKey, wasCurrent: false });

    await expect(revokeActiveSession(sessionKey)).resolves.toEqual({
      success: true,
      revokedSession: sessionKey,
      wasCurrent: false
    });
    expect(mockedApiFetch).toHaveBeenCalledWith(`/api/auth/sessions/${sessionKey}`, { method: 'DELETE' });
  });

  it('rejects invalid session keys before making a request', async () => {
    await expect(revokeActiveSession('raw-session-id')).rejects.toThrow('INVALID_SESSION_KEY');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('rejects a revoke response for a different session key', async () => {
    mockedApiFetch.mockResolvedValue({ success: true, revokedSession: 'b'.repeat(64), wasCurrent: false });

    await expect(revokeActiveSession(sessionKey)).rejects.toThrow('SESSION_REVOKE_INVALID_RESPONSE');
  });
});
