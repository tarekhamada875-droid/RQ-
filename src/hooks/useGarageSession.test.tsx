import { cleanup, renderHook, waitFor } from '@testing-library/react';
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

let snapshotUnsubscribes: ReturnType<typeof vi.fn>[];

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

beforeEach(() => {
  vi.clearAllMocks();
  listenerTracker.reset();
  snapshotUnsubscribes = [];
  sessionMocks.auth.currentUser = { uid: 'garage-owner' };
  sessionMocks.getCanonicalSessionId.mockReturnValue('session-lifecycle-test');
  sessionMocks.onAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
    callback({ uid: 'garage-owner', isAnonymous: false });
    return vi.fn();
  });
  sessionMocks.doc.mockReturnValue({ path: 'garages/garage-1' });
  sessionMocks.claimEntitySession.mockResolvedValue(undefined);
  sessionMocks.onSnapshot.mockImplementation(() => {
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
});
