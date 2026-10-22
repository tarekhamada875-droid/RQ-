import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { getIdToken: () => Promise<string> } },
  apiFetch: vi.fn(),
}));

vi.mock('../firebase', () => ({ auth: serviceMocks.auth, db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn() }));
vi.mock('../utils', () => ({ normalizeDigits: (value: string) => value }));
vi.mock('./authSessionService', () => ({
  claimEntitySession: vi.fn(),
  releaseEntitySession: vi.fn(),
  getCanonicalSessionId: vi.fn(),
}));
vi.mock('../api/apiClient', () => ({ apiFetch: serviceMocks.apiFetch }));

import { authService } from './authService';

describe('authService session validation result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.auth.currentUser = {
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns true or false only for an authoritative Worker response', async () => {
    serviceMocks.apiFetch.mockResolvedValueOnce({ valid: true });
    await expect(authService.validateOrRefreshSessionOnServer('uid-1', 'session-1', 'garage', 'garage-1'))
      .resolves.toBe(true);

    serviceMocks.apiFetch.mockResolvedValueOnce({ valid: false });
    await expect(authService.validateOrRefreshSessionOnServer('uid-1', 'session-1', 'garage', 'garage-1'))
      .resolves.toBe(false);
  });

  it('propagates Worker request failures so callers can distinguish transient errors', async () => {
    const networkError = Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' });
    serviceMocks.apiFetch.mockRejectedValueOnce(networkError);
    await expect(authService.validateOrRefreshSessionOnServer('uid-1', 'session-1', 'garage', 'garage-1'))
      .rejects.toBe(networkError);
  });
});
