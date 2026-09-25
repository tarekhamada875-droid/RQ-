import { beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshEntitySession, claimEntitySession, _resetRecentClaimsForTesting } from './authSessionService';
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
    claimAdminSessionOnServer: vi.fn(),
  },
}));

const mockedRefresh = vi.mocked(authService.validateOrRefreshSessionOnServer);
const mockedRunTransaction = vi.mocked(runTransaction);

describe('auth session server authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRecentClaimsForTesting();
    mockedRefresh.mockResolvedValue(true);
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
});
