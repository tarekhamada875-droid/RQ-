import { describe, it, expect, vi, beforeEach } from 'vitest';
import { firestoreService } from '../services';
import { _resetRecentClaimsForTesting } from '../services/authSessionService';
import { authService } from '../services/authService';
import { runTransaction } from 'firebase/firestore';

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: vi.fn((_db, ...paths) => paths.join('/')),
    collection: vi.fn((_db, path) => path),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    runTransaction: vi.fn(),
  };
});

vi.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'del-1' } },
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' }
}));

describe('claimDelegateSession atomic locking', () => {
  let delegateDocStore: Record<string, any>;
  let releaseSessionOnServerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetRecentClaimsForTesting();
    releaseSessionOnServerSpy = vi.spyOn(authService, 'releaseSessionOnServer').mockResolvedValue();
    delegateDocStore = {
      'delegates/del-1': {
        name: 'Delegate 1',
        pin: '1234',
        currentSessionId: null,
        lastActive: null,
      },
      'delegate_sessions/del-1': {
        uid: 'del-1',
        role: 'delegate',
        entityId: 'del-1',
        sessionId: null,
      }
    };

    let txQueue = Promise.resolve();
    (runTransaction as any).mockImplementation(async (_db: any, callback: any) => {
      const tx = txQueue.then(async () => {
        const mockTransaction = {
          get: vi.fn(async (ref: string) => {
            const docData = delegateDocStore[ref];
            return {
              exists: () => !!docData,
              id: ref.split('/')[1] || 'del-1',
              data: () => docData,
            };
          }),
          update: vi.fn((ref: string, updates: any) => {
            if (delegateDocStore[ref]) {
              delegateDocStore[ref] = {
                ...delegateDocStore[ref],
                ...updates,
                lastActive: updates.lastActive === 'SERVER_TIMESTAMP' ? Date.now() : updates.lastActive,
              };
            }
          }),
          set: vi.fn((ref: string, data: any) => {
            delegateDocStore[ref] = {
              ...(delegateDocStore[ref] || {}),
              ...data,
              lastActive: data.lastActive === 'SERVER_TIMESTAMP' ? Date.now() : data.lastActive,
            };
          }),
        };
        return callback(mockTransaction);
      });
      txQueue = tx.catch(() => {});
      return tx;
    });
  });

  it('allows only one concurrent delegate session claim', async () => {
    const promise1 = firestoreService.claimDelegateSession('del-1', 'session-A');
    const promise2 = firestoreService.claimDelegateSession('del-1', 'session-B');

    const results = await Promise.allSettled([promise1, promise2]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe('DELEGATE_SESSION_OCCUPIED');
  });

  it('allows exactly one winner under high concurrent contention', async () => {
    const attempts = Array.from({ length: 50 }, (_, index) =>
      firestoreService.claimDelegateSession('del-1', `load-session-${index}`)
    );
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter(result => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(49);
    expect(rejected.every(result => (result as PromiseRejectedResult).reason.message === 'DELEGATE_SESSION_OCCUPIED')).toBe(true);
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toMatch(/^load-session-/);
  });

  it('does not replace the winning session', async () => {
    await firestoreService.claimDelegateSession('del-1', 'session-A');
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-A');

    await expect(firestoreService.claimDelegateSession('del-1', 'session-B')).rejects.toThrow('DELEGATE_SESSION_OCCUPIED');

    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-A');
  });

  it('allows the same session to refresh', async () => {
    await firestoreService.claimDelegateSession('del-1', 'session-A');
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-A');

    const refreshed = await firestoreService.claimDelegateSession('del-1', 'session-A');
    expect(refreshed.currentSessionId).toBe('session-A');
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-A');
  });

  it('rejects a missing delegate ID instead of returning a fake session', async () => {
    await expect(firestoreService.claimDelegateSession('')).rejects.toThrow('DELEGATE_ID_REQUIRED');
  });

  it('allows a new session only after the old session is inactive', async () => {
    delegateDocStore['delegates/del-1'] = {
      name: 'Delegate 1',
      pin: '1234',
      currentSessionId: 'session-OLD',
      lastActive: Date.now() - 25 * 60 * 60 * 1000,
    };

    const newClaim = await firestoreService.claimDelegateSession('del-1', 'session-NEW');
    expect(newClaim.currentSessionId).toBe('session-NEW');
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-NEW');
  });

  it('delegates release to the server without mutating browser session state', async () => {
    await firestoreService.claimDelegateSession('del-1', 'session-A');
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-A');

    await firestoreService.releaseDelegateSession('del-1', 'session-OTHER');
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-A');
    expect(releaseSessionOnServerSpy).toHaveBeenLastCalledWith(
      'del-1',
      'session-OTHER',
      'delegate',
      'del-1'
    );

    await firestoreService.releaseDelegateSession('del-1', 'session-A');
    expect(delegateDocStore['delegates/del-1'].currentSessionId).toBe('session-A');
    expect(releaseSessionOnServerSpy).toHaveBeenLastCalledWith(
      'del-1',
      'session-A',
      'delegate',
      'del-1'
    );
  });
});
