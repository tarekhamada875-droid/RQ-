import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAndGarageManagement } from './useAdminAndGarageManagement';
import { deleteGarageWithRecovery } from '../services/garageDeletionService';
import { authService } from '../services/authService';
import { delegateService, garageService } from '../services';

const mocks = vi.hoisted(() => ({
  authenticateUserCredentials: vi.fn(),
  currentUser: {
    uid: 'staff-login-user',
    getIdToken: vi.fn()
  },
  db: {},
  doc: vi.fn(),
  getDoc: vi.fn(),
  releaseEntitySession: vi.fn(),
  recordSessionAsClaimed: vi.fn(),
  claimEntitySession: vi.fn(),
  signInAnonymously: vi.fn(),
  logDiagnostic: vi.fn()
}));

vi.mock('../services', () => { const _svc = {
  updateGarage: vi.fn().mockResolvedValue(undefined),
  createGarage: vi.fn().mockResolvedValue({ success: true, id: 'garage-created' }),
  isPinTaken: vi.fn().mockResolvedValue({ taken: false }),
  authenticateUserCredentials: mocks.authenticateUserCredentials,
  addDelegate: vi.fn().mockResolvedValue({ id: 'delegate-1' }),
  removeDelegate: vi.fn().mockResolvedValue(undefined)
}; return { garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });
vi.mock('../services/garageDeletionService', () => ({
  deleteGarageWithRecovery: vi.fn(),
  garageDeletionFailureMessage: vi.fn()
}));
vi.mock('../services/authService', () => ({
  authService: {
    authenticateUserCredentials: mocks.authenticateUserCredentials,
    isPinTaken: vi.fn().mockResolvedValue({ taken: false }),
  }
}));
vi.mock('../firebase', () => ({
  auth: { currentUser: mocks.currentUser },
  db: mocks.db
}));
vi.mock('firebase/auth', () => ({ signInAnonymously: mocks.signInAnonymously }));
vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  getDoc: mocks.getDoc
}));
vi.mock('../services/authSessionService', () => ({
  claimEntitySession: mocks.claimEntitySession,
  releaseEntitySession: mocks.releaseEntitySession,
  recordSessionAsClaimed: mocks.recordSessionAsClaimed
}));
vi.mock('../utils', () => ({
  safeDate: () => new Date(0),
  normalizeDigits: (value: string) => value,
  normalizePhone: (value: string) => value
}));
vi.mock('../utils/authDiagnosticLogger', () => ({ logDiagnostic: mocks.logDiagnostic }));

const createProps = () => ({
  allGarages: [],
  delegate: null,
  loginPhone: '12345678',
  setLoginPhone: vi.fn(),
  setUser: vi.fn(),
  setGarage: vi.fn(),
  setDelegate: vi.fn(),
  setSelectedGarageForDetails: vi.fn(),
  setView: vi.fn(),
  setIsLoading: vi.fn(),
  setShowDeleteConfirm: vi.fn(),
  setGarageDeletionProgress: vi.fn(),
  sessionId: 'session-1',
  isOnline: true,
  isLoading: false,
  closeKeyboard: vi.fn(),
  showToast: vi.fn(),
  refreshAdminLists: vi.fn().mockResolvedValue(undefined)
});

const garageAuthResult = {
  success: true,
  role: 'garage',
  sessionClaimed: true,
  account: {
    id: 'garage-1',
    name: 'Test Garage',
    pin: 'garage-secret',
    status: 'approved'
  }
};

beforeEach(() => {
  mocks.authenticateUserCredentials.mockReset().mockResolvedValue(garageAuthResult);
  mocks.currentUser.getIdToken.mockReset().mockResolvedValue('test-token');
  mocks.doc.mockReset().mockReturnValue({ path: 'garages/garage-1' });
  mocks.getDoc.mockReset();
  mocks.releaseEntitySession.mockReset().mockResolvedValue(undefined);
  mocks.recordSessionAsClaimed.mockReset();
  mocks.claimEntitySession.mockReset();
  mocks.signInAnonymously.mockReset();
  mocks.logDiagnostic.mockReset();
  vi.mocked(garageService.updateGarage).mockReset().mockResolvedValue(undefined);
  vi.mocked(garageService.createGarage).mockReset().mockResolvedValue({ success: true, id: 'garage-created' });
  vi.mocked(authService.isPinTaken).mockReset().mockResolvedValue({ taken: false } as any);
  vi.mocked(delegateService.addDelegate).mockReset().mockResolvedValue({ id: 'delegate-1' });
  vi.mocked(delegateService.removeDelegate).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteGarageWithRecovery).mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useAdminAndGarageManagement garage-owner login', () => {
  it('reuses the same idempotency key when retrying an ambiguous garage creation result', async () => {
    vi.mocked(garageService.createGarage)
      .mockResolvedValueOnce({ success: false, error: 'NETWORK_TIMEOUT' })
      .mockResolvedValueOnce({ success: true, id: 'garage-created' });
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));
    const form = document.createElement('form');
    for (const [name, value] of Object.entries({
      name: 'Test Garage',
      phone: '01012345678',
      hourlyRate: '10',
      overnightRate: '20',
      pin: '1234',
      isTrial: 'false'
    })) {
      const input = document.createElement('input');
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    const event = { preventDefault: vi.fn(), currentTarget: form } as unknown as React.FormEvent<HTMLFormElement>;

    await act(async () => {
      await result.current.createNewGarage(event);
    });
    await act(async () => {
      await result.current.createNewGarage(event);
    });

    expect(garageService.createGarage).toHaveBeenCalledTimes(2);
    const firstKey = vi.mocked(garageService.createGarage).mock.calls[0][1];
    const secondKey = vi.mocked(garageService.createGarage).mock.calls[1][1];
    expect(firstKey).toEqual(expect.any(String));
    expect(secondKey).toBe(firstKey);
    expect(authService.isPinTaken).toHaveBeenCalledTimes(1);
    expect(props.refreshAdminLists).toHaveBeenCalledOnce();
  });

  it('refreshes Admin lists after a successful garage deletion', async () => {
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.deleteGarage({ id: 'garage-1' } as any);
    });

    expect(deleteGarageWithRecovery).toHaveBeenCalledWith('garage-1', expect.any(Function));
    expect(props.refreshAdminLists).toHaveBeenCalledOnce();
    expect(props.setView).toHaveBeenCalledWith('admin_dashboard');
  });

  it('does not refresh Admin lists when garage deletion fails', async () => {
    vi.mocked(deleteGarageWithRecovery).mockResolvedValue({
      ok: false,
      errorCode: 'DENIED',
      status: null,
      error: new Error('DENIED')
    });
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.deleteGarage({ id: 'garage-1' } as any);
    });

    expect(props.refreshAdminLists).not.toHaveBeenCalled();
    expect(props.setView).not.toHaveBeenCalled();
  });

  it('refreshes Admin lists after successful delegate delete', async () => {
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.removeDelegate('delegate-1');
    });
    expect(delegateService.removeDelegate).toHaveBeenCalledWith('delegate-1');
    expect(props.refreshAdminLists).toHaveBeenCalledTimes(1);
  });

  it('releases the exact attempted session when a login claim fails ambiguously', async () => {
    mocks.authenticateUserCredentials.mockResolvedValue({
      ...garageAuthResult,
      sessionClaimed: false
    });
    mocks.claimEntitySession.mockRejectedValue(new Error('network timeout'));
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(mocks.claimEntitySession).toHaveBeenCalledWith({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-1',
      uid: 'staff-login-user',
      pin: '12345678'
    });
    expect(mocks.releaseEntitySession).toHaveBeenCalledWith({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-1',
      uid: 'staff-login-user'
    });
    expect(props.setView).not.toHaveBeenCalledWith('garage');
  });

  it('scrubs the garage PIN on successful login and navigates to the garage view', async () => {
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(props.setGarage).toHaveBeenCalledTimes(1);
    expect(props.setGarage).toHaveBeenCalledWith({ id: 'garage-1', name: 'Test Garage', status: 'approved' });
    expect(props.setView).toHaveBeenCalledWith('garage');
  });

  it.each(['pending', 'rejected'])('releases the session and refuses login when the garage account status is %s', async (status) => {
    mocks.authenticateUserCredentials.mockResolvedValue({
      ...garageAuthResult,
      account: { ...garageAuthResult.account, status }
    });
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(mocks.releaseEntitySession).toHaveBeenCalledWith({
      role: 'garage',
      entityId: 'garage-1',
      sessionId: 'session-1',
      uid: 'staff-login-user'
    });
    expect(props.setGarage).not.toHaveBeenCalled();
    expect(props.setView).not.toHaveBeenCalled();
  });

  it('keeps the retired account role out of Admin', async () => {
    mocks.authenticateUserCredentials.mockResolvedValue({
      success: true,
      role: 'supervisor',
      sessionClaimed: true,
      account: { id: 'supervisor-1' }
    } as any);
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));
    await act(async () => { await result.current.handleGarageLogin(); });
    expect(props.setView).not.toHaveBeenCalledWith('admin_dashboard');
  });

});
