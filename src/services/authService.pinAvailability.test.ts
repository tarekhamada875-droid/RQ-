import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/apiClient';
import { authService } from './authService';

vi.mock('../api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('../firebase', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), setDoc: vi.fn(), serverTimestamp: vi.fn() }));
vi.mock('../utils', () => ({ normalizeDigits: (value: string) => value }));
vi.mock('./authSessionService', () => ({
  claimEntitySession: vi.fn(),
  releaseEntitySession: vi.fn(),
  getCanonicalSessionId: vi.fn(),
}));

describe('authService.checkPinAvailability', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns a valid availability result from the server', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({ taken: false } as never);

    await expect(authService.checkPinAvailability('12345678')).resolves.toEqual({ taken: false });
  });

  it('propagates API failures instead of treating the PIN as available', async () => {
    const error = new Error('NETWORK_ERROR');
    vi.mocked(apiFetch).mockRejectedValueOnce(error);

    await expect(authService.checkPinAvailability('12345678')).rejects.toBe(error);
  });

  it('rejects a malformed successful response instead of treating the PIN as available', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({} as never);

    await expect(authService.checkPinAvailability('12345678')).rejects.toThrow('PIN_AVAILABILITY_CHECK_FAILED');
  });
});
