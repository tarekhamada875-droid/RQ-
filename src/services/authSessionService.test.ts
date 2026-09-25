import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshEntitySession, claimEntitySession, releaseEntitySession, _resetRecentClaimsForTesting } from './authSessionService';
import { authService } from './authService';
import { runTransaction } from 'firebase/firestore';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...parts: string[]) => parts.join('/')),
  runTransaction: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('./authService', () => ({
  authService: {
    validateOrRefreshSessionOnServer: vi.fn(),
    releaseSessionOnServer: vi.fn(),
    claimAdminSessionOnServer: vi.fn(),
  },
}));

const mockedRefresh = vi.mocked(authService.validateOrRefreshSessionOnServer);
const mockedRelease = vi.mocked(authService.releaseSessionOnServer);
const mockedRunTransaction = vi.mocked(runTransaction);

describe('auth session server authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRecentClaimsForTesting();
    mockedRefresh.mockResolvedValue(true);
    mockedRelease.mockResolvedValue();
  });

  it('refreshes the session through the server and does not write Firestore from the browser', async () => {
    await refreshEntitySession({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-1',
      uid: 'firebase-uid-1',
    });

    expect(mockedRefresh).toHaveBeenCalledWith(
      'firebase-uid-1',
      'session-1',
      'garage',
      'garage-1'
    );
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });

  it('does not start a browser transaction when an existing session is validated by the server', async () => {
    await claimEntitySession({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-1',
      uid: 'firebase-uid-1',
    });

    expect(mockedRefresh).toHaveBeenCalledWith(
      'firebase-uid-1',
      'session-1',
      'garage',
      'garage-1'
    );
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });

  it('does not write browser session documents when the server rejects a refresh', async () => {
    mockedRefresh.mockResolvedValue(false);

    await refreshEntitySession({
      role: 'staff',
      entityId: 'staff-1',
      sessionId: 'session-2',
      uid: 'firebase-uid-2',
    });

    expect(mockedRefresh).toHaveBeenCalledWith(
      'firebase-uid-2',
      'session-2',
      'staff',
      'staff-1'
    );
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });

  it('fails closed during a server outage without attempting a browser fallback write', async () => {
    mockedRefresh.mockRejectedValue(new Error('SERVER_UNAVAILABLE'));

    await expect(refreshEntitySession({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-outage',
      uid: 'firebase-uid-outage',
    })).resolves.toBeUndefined();

    expect(mockedRefresh).toHaveBeenCalledWith(
      'firebase-uid-outage',
      'session-outage',
      'garage',
      'garage-1'
    );
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });

  it('releases the session through the server without a browser transaction', async () => {
    await releaseEntitySession({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-1',
      uid: 'firebase-uid-1',
    });

    expect(mockedRelease).toHaveBeenCalledWith(
      'firebase-uid-1',
      'session-1',
      'garage',
      'garage-1'
    );
    expect(mockedRunTransaction).not.toHaveBeenCalled();
  });
});
