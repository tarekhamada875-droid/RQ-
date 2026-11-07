import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listActiveSessions, revokeActiveSession } from './sessionService';

// Mock apiCall (which wraps apiFetch) at the module level
vi.mock('../api/apiCall', () => ({
  apiCall: vi.fn()
}));

import { apiCall } from '../api/apiCall';
const mockedApiCall = vi.mocked(apiCall);
const sessionKey = 'a'.repeat(64);

beforeEach(() => {
  mockedApiCall.mockReset();
});

describe('sessionService', () => {
  it('lists active sessions from the API response', async () => {
    const sessions = [{
      id: sessionKey,
      isCurrent: true,
      isActive: true,
      createdAt: '2026-09-23T05:00:00.000Z',
      lastActive: '2026-09-23T05:10:00.000Z'
    }];
    mockedApiCall.mockResolvedValue({ sessions } as any);

    await expect(listActiveSessions()).resolves.toEqual(sessions);
    expect(mockedApiCall).toHaveBeenCalledWith('/api/auth/sessions');
  });

  it('returns empty array when sessions field is missing or invalid', async () => {
    mockedApiCall.mockResolvedValue({ sessions: 'not-an-array' } as any);
    await expect(listActiveSessions()).resolves.toEqual([]);
  });

  it('revokes a valid opaque session key with DELETE', async () => {
    mockedApiCall.mockResolvedValue({ revokedSession: sessionKey, wasCurrent: false } as any);

    await expect(revokeActiveSession(sessionKey)).resolves.toEqual({
      revokedSession: sessionKey,
      wasCurrent: false
    });
    expect(mockedApiCall).toHaveBeenCalledWith(`/api/auth/sessions/${sessionKey}`, { method: 'DELETE' });
  });

  it('rejects invalid session keys before making a request', async () => {
    await expect(revokeActiveSession('raw-session-id')).rejects.toThrow('INVALID_SESSION_KEY');
    expect(mockedApiCall).not.toHaveBeenCalled();
  });
});
