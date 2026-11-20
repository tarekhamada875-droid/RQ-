import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenerTracker } from '../utils/listenerTracker';

const sessionMocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'garage-owner' } },
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  getCanonicalSessionId: vi.fn(),
  claimEntitySession: vi.fn(),
  releaseEntitySession: vi.fn(),
  refreshEntitySession: vi.fn(),
  validateOrRefreshSessionOnServer: vi.fn(),
  signInAnonymouslyOnce: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: sessionMocks.onAuthStateChanged,
  signOut: sessionMocks.signOut,
}));

vi.mock('firebase/firestore', () => ({
  doc: sessionMocks.doc,
  onSnapshot: sessionMocks.onSnapshot,
}));

vi.mock('../firebase', () => ({
  auth: sessionMocks.auth,
  db: {},
}));

vi.mock('../utils/authDiagnosticLogger', () => ({ logDiagnostic: vi.fn() }));

vi.mock('../services/authSessionService', () => ({
  getCanonicalSessionId: sessionMocks.getCanonicalSessionId,
  claimEntitySession: sessionMocks.claimEntitySession,
  releaseEntitySession: sessionMocks.releaseEntitySession,
  refreshEntitySession: sessionMocks.refreshEntitySession,
}));

vi.mock('../services/authService', () => ({
  authService: { validateOrRefreshSessionOnServer: sessionMocks.validateOrRefreshSessionOnServer },
}));

vi.mock('../services/anonymousAuth', () => ({ signInAnonymouslyOnce: sessionMocks.signInAnonymouslyOnce }));

import { useGarageSession } from './useGarageSession';

type SnapshotCallback = (snapshot: {
  metadata: { fromCache: boolean };
  exists: () => boolean;
  data: () => Record<string, unknown>;
}) => void;

let snapshotUnsubscribes: ReturnType<typeof vi.fn>[];
let snapshotCallbacks: SnapshotCallback[];

const createProps = () => ({
  view: 'garage',
  setView: vi.fn(),
  garage: { id: 'garage-1' } as any,
  setGarage: vi.fn(),
  delegate: null,
  setDelegate: vi.fn(),
  currentStaff: null,
  setCurrentStaff: vi.fn(),
  currentSupervisor: null,
  setCurrentSupervisor: vi.fn(),
  showToast: vi.fn(),
});

const entitySnapshot = (activeSessionIds: string[], currentSessionId?: string) => ({
  metadata: { fromCache: false },
  exists: () => true,
  data: () => ({ activeSessionIds, currentSessionId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  listenerTracker.reset();
  snapshotUnsubscribes = [];
  snapshotCallbacks = [];
  sessionMocks.auth.currentUser = { uid: 'garage-owner' };
  sessionMocks.getCanonicalSessionId.mockReturnValue('session-lifecycle-test');
  sessionMocks.onAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
    callback({ uid: 'garage-owner', isAnonymous: false });
    return vi.fn();
  });
  sessionMocks.doc.mockReturnValue({ path: 'garages/garage-1' });
  sessionMocks.claimEntitySession.mockResolvedValue(undefined);
  sessionMocks.releaseEntitySession.mockResolvedValue(undefined);
  sessionMocks.refreshEntitySession.mockResolvedValue(true);
  sessionMocks.validateOrRefreshSessionOnServer.mockResolvedValue(true);
  sessionMocks.onSnapshot.mockImplementation((_ref: unknown, callback: SnapshotCallback) => {
    snapshotCallbacks.push(callback);
    const unsubscribe = vi.fn();
    snapshotUnsubscribes.push(unsubscribe);
    return unsubscribe;
  });
  sessionMocks.signOut.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  listenerTracker.reset();
  vi.restoreAllMocks();
});

describe('useGarageSession Firestore listener lifecycle', () => {
  it.each([
    ['malformed JSON', '{invalid-json'],
    ['an object without an ID', JSON.stringify({ name: 'stale garage' })],
    ['a JSON primitive', JSON.stringify('stale garage')],
  ])('returns to login instead of waiting for %s in persisted garage data', async (_label, savedValue) => {
    localStorage.setItem('app_garage', savedValue);
    const props = { ...createProps(), garage: null };

    const hook = renderHook(() => useGarageSession(props));

    await waitFor(() => expect(props.setView).toHaveBeenCalledWith('login'));
    await waitFor(() => expect(hook.result.current.isSessionReady).toBe(true));
    expect(localStorage.getItem('app_garage')).toBeNull();
    expect(sessionMocks.claimEntitySession).not.toHaveBeenCalled();

    hook.unmount();
  });


  it('does not unlock a protected view when the initial session claim fails', async () => {
    const props = createProps();
    sessionMocks.claimEntitySession.mockRejectedValueOnce(
      Object.assign(new Error('SERVER_UNAVAILABLE'), { code: 'SERVER_UNAVAILABLE' })
    );

    const hook = renderHook(() => useGarageSession(props));

    await waitFor(() => expect(props.setView).toHaveBeenCalledWith('login'));
    expect(hook.result.current.isSessionReady).toBe(false);
    expect(props.showToast).toHaveBeenCalledWith(
      'تعذر تهيئة الجلسة. يرجى تسجيل الدخول مرة أخرى',
      'error'
    );
    expect(sessionMocks.releaseEntitySession).toHaveBeenCalledWith({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-lifecycle-test',
      uid: 'garage-owner'
    });
    expect(sessionMocks.onSnapshot).not.toHaveBeenCalled();
    expect(sessionMocks.refreshEntitySession).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('closes the session-guard snapshot on unmount and starts cleanly after remount', async () => {
    const firstMount = renderHook(() => useGarageSession(createProps()));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledOnce());
    expect(listenerTracker.getActiveListenersMap()).toEqual({
      'session_guard/garages/garage-1': 1,
    });

    firstMount.unmount();
    expect(snapshotUnsubscribes[0]).toHaveBeenCalledOnce();
    expect(listenerTracker.getActiveListenerCount()).toBe(0);

    const secondMount = renderHook(() => useGarageSession(createProps()));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledTimes(2));
    expect(listenerTracker.getActiveListenersMap()).toEqual({
      'session_guard/garages/garage-1': 1,
    });

    secondMount.unmount();
    expect(snapshotUnsubscribes[1]).toHaveBeenCalledOnce();
    expect(listenerTracker.getActiveListenerCount()).toBe(0);
  });

  it('logs out promptly when the heartbeat confirms the session was revoked', async () => {
    const props = createProps();
    sessionMocks.refreshEntitySession.mockResolvedValue(false);
    const intervalSpy = vi.spyOn(globalThis, 'setInterval');

    const hook = renderHook(() => useGarageSession(props));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledOnce());

    const heartbeat = intervalSpy.mock.calls.find(([, delay]) => delay === 60 * 60 * 1000)?.[0] as
      (() => Promise<void>) | undefined;
    expect(heartbeat).toBeDefined();

    await act(async () => {
      await heartbeat?.();
    });

    await waitFor(() => expect(props.setView).toHaveBeenCalledWith('login'));
    expect(props.showToast).toHaveBeenCalledWith('تم تسجيل خروجك من جهاز آخر', 'error');
    // PERF (2026-11-20): signOut is no longer called on logout — the Firebase
    // anonymous account is kept alive and reused on next login so the 2-second
    // Firebase account-creation round-trip is skipped. Security is unaffected
    // (the PIN check on the Worker is the actual security gate).
    expect(sessionMocks.signOut).not.toHaveBeenCalled();

    hook.unmount();
    intervalSpy.mockRestore();
  });

  it('does not log out or re-validate when the entity marker shows another device', async () => {
    // 2026-11-13 incident: the entity doc's activeSessionIds array has several
    // non-transactional Worker writers, so marker churn must not be treated as
    // eviction. The guard ignores marker changes entirely; revocation arrives
    // through API 401s and the validate-or-refresh heartbeat instead.
    const props = createProps();
    const hook = renderHook(() => useGarageSession(props));
    await waitFor(() => expect(snapshotCallbacks).toHaveLength(1));

    await act(async () => {
      snapshotCallbacks[0](entitySnapshot(['session-lifecycle-test']));
      snapshotCallbacks[0](entitySnapshot([], 'session-on-another-device'));
      snapshotCallbacks[0](entitySnapshot([]));
      await Promise.resolve();
    });

    expect(sessionMocks.validateOrRefreshSessionOnServer).not.toHaveBeenCalled();
    expect(props.setView).not.toHaveBeenCalled();
    expect(props.showToast).not.toHaveBeenCalled();
    expect(sessionMocks.releaseEntitySession).not.toHaveBeenCalled();
    expect(sessionMocks.signOut).not.toHaveBeenCalled();
    expect(listenerTracker.getActiveListenerCount()).toBe(1);

    hook.unmount();
    expect(listenerTracker.getActiveListenerCount()).toBe(0);
  });

  it('does not install timers or listeners if unmounted while the session claim is pending', async () => {
    let resolveClaim!: () => void;
    const pendingClaim = new Promise<void>((resolve) => {
      resolveClaim = resolve;
    });
    sessionMocks.claimEntitySession.mockReturnValue(pendingClaim);

    const hook = renderHook(() => useGarageSession(createProps()));
    await waitFor(() => expect(sessionMocks.claimEntitySession).toHaveBeenCalledOnce());
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const documentListenerSpy = vi.spyOn(document, 'addEventListener');
    hook.unmount();

    await act(async () => {
      resolveClaim();
      await pendingClaim;
    });

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(documentListenerSpy.mock.calls.some(([eventName]) => eventName === 'visibilitychange')).toBe(false);
    expect(sessionMocks.onSnapshot).not.toHaveBeenCalled();
    expect(sessionMocks.refreshEntitySession).not.toHaveBeenCalled();
    expect(listenerTracker.getActiveListenerCount()).toBe(0);
  });

  it('keeps the app locked until the previous entity session is released', async () => {
    let resolveRelease!: () => void;
    sessionMocks.releaseEntitySession.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveRelease = resolve;
    }));
    const props = createProps();
    const hook = renderHook(() => useGarageSession(props));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledOnce());

    act(() => {
      void hook.result.current.handleLogout();
    });

    await waitFor(() => expect(hook.result.current.isLoggingOut).toBe(true));
    expect(props.setView).toHaveBeenCalledWith('login');
    expect(sessionMocks.signOut).not.toHaveBeenCalled();

    await act(async () => {
      resolveRelease();
      await Promise.resolve();
    });

    await waitFor(() => expect(hook.result.current.isLoggingOut).toBe(false));
    // PERF (2026-11-20): no signOut on logout — anonymous account kept alive.
    expect(sessionMocks.signOut).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('does not sign out a different Firebase identity after delayed release', async () => {
    let resolveRelease!: () => void;
    sessionMocks.releaseEntitySession.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveRelease = resolve;
    }));
    const hook = renderHook(() => useGarageSession(createProps()));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledOnce());

    act(() => {
      void hook.result.current.handleLogout();
    });
    await waitFor(() => expect(hook.result.current.isLoggingOut).toBe(true));
    sessionMocks.auth.currentUser = { uid: 'new-firebase-user' };

    await act(async () => {
      resolveRelease();
      await Promise.resolve();
    });

    await waitFor(() => expect(hook.result.current.isLoggingOut).toBe(false));
    expect(sessionMocks.signOut).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('sweeps stale logout attempt counters at session teardown but preserves device-scoped keys', async () => {
    // Counters from identities/sessions that never complete a successful
    // logout survive until teardown: a remote kick or abandoned modal never
    // reaches the modal's own purge, and dead identities' counters would
    // otherwise persist forever on long-lived garage devices.
    localStorage.setItem('logout_attempts:staff-1:session:old-device-uuid', '2');
    localStorage.setItem('logout_attempts:admin:session:session-lifecycle-test', '1');
    localStorage.setItem('app_garage', JSON.stringify({ id: 'garage-1' }));
    localStorage.setItem('app_admin_color', 'emerald');
    localStorage.setItem('app_theme', 'dark');
    localStorage.setItem('app_session_id', 'keep-me');
    localStorage.setItem('rq_canonical_session_id', 'session-lifecycle-test');

    const props = createProps();
    const hook = renderHook(() => useGarageSession(props));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledOnce());

    await act(async () => {
      await hook.result.current.handleLogout();
    });

    expect(localStorage.getItem('logout_attempts:staff-1:session:old-device-uuid')).toBeNull();
    expect(localStorage.getItem('logout_attempts:admin:session:session-lifecycle-test')).toBeNull();
    // Existing teardown contract is unchanged:
    expect(localStorage.getItem('app_garage')).toBeNull();
    expect(localStorage.getItem('app_admin_color')).toBe('emerald');
    expect(localStorage.getItem('app_theme')).toBe('dark');
    expect(localStorage.getItem('app_session_id')).toBe('keep-me');
    expect(localStorage.getItem('rq_canonical_session_id')).toBe('session-lifecycle-test');
    // PERF (2026-11-20): no signOut on logout — anonymous account kept alive.
    expect(sessionMocks.signOut).not.toHaveBeenCalled();

    hook.unmount();
  });

  it('finishes in-memory logout when browser storage removal throws', async () => {
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const props = createProps();
    const hook = renderHook(() => useGarageSession(props));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledOnce());

    await act(async () => {
      await hook.result.current.handleLogout();
    });

    expect(props.setGarage).toHaveBeenCalledWith(null);
    expect(props.setDelegate).toHaveBeenCalledWith(null);
    expect(props.setCurrentStaff).toHaveBeenCalledWith(null);
    expect(props.setView).toHaveBeenCalledWith('login');
    // PERF (2026-11-20): no signOut on logout — anonymous account kept alive.
    expect(sessionMocks.signOut).not.toHaveBeenCalled();
    expect(hook.result.current.isLoggingOut).toBe(false);

    removeItemSpy.mockRestore();
    hook.unmount();
  });

  it('PERF (2026-11-20): keeps the Firebase anonymous account alive after logout so next login reuses it (skips the 2s Firebase round-trip)', async () => {
    // The owner's debug files showed 9 different Firebase anonymous uids
    // created over 2 days of normal use — each cost a ~2s round-trip to
    // Google's servers. The fix: don't call signOut(auth) on logout. The
    // existing anonymous account is reused on next login because
    // signInAnonymouslyOnce() short-circuits when auth.currentUser exists.
    // This test verifies the new behavior: after logout, auth.currentUser
    // is still set (not signed out), so the next signInAnonymouslyOnce()
    // call returns the same user without a network round-trip.
    const props = createProps();
    const hook = renderHook(() => useGarageSession(props));
    await waitFor(() => expect(sessionMocks.onSnapshot).toHaveBeenCalledOnce());

    // Set up an existing anonymous user (simulating a prior login).
    const existingUid = 'existing-anon-uid-123';
    sessionMocks.auth.currentUser = { uid: existingUid } as any;
    sessionMocks.signInAnonymouslyOnce.mockClear();

    await act(async () => {
      await hook.result.current.handleLogout();
    });

    // After logout: the Firebase anonymous account is STILL there.
    expect(sessionMocks.signOut).not.toHaveBeenCalled();
    expect(sessionMocks.auth.currentUser).toBeTruthy();
    expect(sessionMocks.auth.currentUser.uid).toBe(existingUid);
    // And signInAnonymouslyOnce was NOT called during logout (it's only
    // called during the next login's runCoordinator, which is not triggered
    // by logout — only by a future login attempt).
    expect(sessionMocks.signInAnonymouslyOnce).not.toHaveBeenCalled();

    hook.unmount();
  });
});
