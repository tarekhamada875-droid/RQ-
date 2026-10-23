import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAndGarageManagement } from './useAdminAndGarageManagement';
import { deleteGarageWithRecovery } from '../services/garageDeletionService';
import { firestoreService } from '../services';

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

vi.mock('../services', () => ({ firestoreService: {
  updateGarage: vi.fn().mockResolvedValue(undefined),
  createGarage: vi.fn().mockResolvedValue({ success: true, id: 'garage-created' }),
  isPinTaken: vi.fn().mockResolvedValue({ taken: false }),
  addDelegate: vi.fn().mockResolvedValue({ id: 'delegate-1' }),
  removeDelegate: vi.fn().mockResolvedValue(undefined)
} }));
vi.mock('../services/garageDeletionService', () => ({
  deleteGarageWithRecovery: vi.fn(),
  garageDeletionFailureMessage: vi.fn()
}));
vi.mock('../services/authService', () => ({
  authService: { authenticateUserCredentials: mocks.authenticateUserCredentials }
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

const createSnapshot = (exists: boolean, garageData: Record<string, unknown> = {}) => ({
  exists: vi.fn(() => exists),
  id: 'garage-1',
  data: vi.fn(() => garageData)
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


const createProps = () => ({
  allGarages: [],
  packages: [],
  delegate: null,
  currentSupervisor: null,
  loginPhone: '12345678',
  setLoginPhone: vi.fn(),
  setAdminPin: vi.fn(),
  setActiveAdminPin: vi.fn(),
  setUser: vi.fn(),
  setGarage: vi.fn(),
  setDelegate: vi.fn(),
  setCurrentStaff: vi.fn(),
  setCurrentSupervisor: vi.fn(),
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

const staffAuthResult = {
  success: true,
  role: 'staff',
  sessionClaimed: true,
  account: {
    id: 'staff-1',
    garageId: 'garage-1',
    name: 'Test Staff',
    pin: 'staff-secret'
  }
};

beforeEach(() => {
  mocks.authenticateUserCredentials.mockReset().mockResolvedValue(staffAuthResult);
  mocks.currentUser.getIdToken.mockReset().mockResolvedValue('test-token');
  mocks.doc.mockReset().mockReturnValue({ path: 'garages/garage-1' });
  mocks.getDoc.mockReset();
  mocks.releaseEntitySession.mockReset().mockResolvedValue(undefined);
  mocks.recordSessionAsClaimed.mockReset();
  mocks.claimEntitySession.mockReset();
  mocks.signInAnonymously.mockReset();
  mocks.logDiagnostic.mockReset();
  vi.mocked(firestoreService.updateGarage).mockReset().mockResolvedValue(undefined);
  vi.mocked(firestoreService.createGarage).mockReset().mockResolvedValue({ success: true, id: 'garage-created' });
  vi.mocked(firestoreService.isPinTaken).mockReset().mockResolvedValue({ taken: false } as any);
  vi.mocked(firestoreService.addDelegate).mockReset().mockResolvedValue({ id: 'delegate-1' });
  vi.mocked(firestoreService.removeDelegate).mockReset().mockResolvedValue(undefined);
  vi.mocked(deleteGarageWithRecovery).mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useAdminAndGarageManagement staff login garage read (FE-004)', () => {
  it('reuses the same idempotency key when retrying an ambiguous garage creation result', async () => {
    vi.mocked(firestoreService.createGarage)
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

    expect(firestoreService.createGarage).toHaveBeenCalledTimes(2);
    const firstKey = vi.mocked(firestoreService.createGarage).mock.calls[0][1];
    const secondKey = vi.mocked(firestoreService.createGarage).mock.calls[1][1];
    expect(firstKey).toEqual(expect.any(String));
    expect(secondKey).toBe(firstKey);
    expect(firestoreService.isPinTaken).toHaveBeenCalledTimes(1);
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

  it('refreshes Admin lists after successful garage-rate updates', async () => {
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.updateGarageRate({ id: 'garage-1' } as any, 'hourlyRate', 25);
    });

    expect(firestoreService.updateGarage).toHaveBeenCalledWith('garage-1', { hourlyRate: 25 });
    expect(props.refreshAdminLists).toHaveBeenCalledOnce();
  });

  it('refreshes Admin lists after successful delegate create and delete', async () => {
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    let created: unknown;
    await act(async () => {
      created = await result.current.addDelegate({ name: 'Delegate' } as any);
    });
    expect(created).toEqual({ id: 'delegate-1' });
    expect(props.refreshAdminLists).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.removeDelegate('delegate-1');
    });
    expect(firestoreService.removeDelegate).toHaveBeenCalledWith('delegate-1');
    expect(props.refreshAdminLists).toHaveBeenCalledTimes(2);
  });

  it('reuses the status-check snapshot on successful login and scrubs garage PIN', async () => {
    mocks.getDoc.mockResolvedValue(createSnapshot(true, {
      name: 'Test Garage',
      status: 'active',
      pin: 'garage-secret'
    }));
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(mocks.doc).toHaveBeenCalledTimes(1);
    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    expect(mocks.doc).toHaveBeenCalledWith(mocks.db, 'garages', 'garage-1');
    expect(props.setGarage).toHaveBeenCalledTimes(1);
    expect(props.setGarage).toHaveBeenCalledWith({ id: 'garage-1', name: 'Test Garage', status: 'active' });
    expect(props.setCurrentStaff).toHaveBeenCalledWith({
      id: 'staff-1',
      garageId: 'garage-1',
      name: 'Test Staff'
    });
    expect(props.setView).toHaveBeenCalledWith('garage');
  });

  it.each(['pending', 'rejected'])('reads the linked garage once and releases the session when its status is %s', async (status) => {
    mocks.getDoc.mockResolvedValue(createSnapshot(true, { name: 'Test Garage', status }));
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    expect(mocks.releaseEntitySession).toHaveBeenCalledWith({
      role: 'staff',
      entityId: 'staff-1',
      sessionId: 'session-1',
      uid: 'staff-login-user'
    });
    expect(props.setGarage).not.toHaveBeenCalled();
    expect(props.setCurrentStaff).not.toHaveBeenCalled();
    expect(props.setView).not.toHaveBeenCalled();
  });

  it('releases the claimed Staff session and refuses login when the linked garage is missing', async () => {
    mocks.getDoc.mockResolvedValue(createSnapshot(false));
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    expect(mocks.releaseEntitySession).toHaveBeenCalledWith({
      role: 'staff',
      entityId: 'staff-1',
      sessionId: 'session-1',
      uid: 'staff-login-user'
    });
    expect(props.setGarage).not.toHaveBeenCalled();
    expect(props.setCurrentStaff).not.toHaveBeenCalled();
    expect(props.setView).not.toHaveBeenCalled();
    expect(props.showToast).toHaveBeenCalledWith('الورشة المرتبطة بهذا الحساب غير موجودة', 'error');
  });

  it('releases the claimed Staff session if reading the linked garage fails', async () => {
    mocks.getDoc.mockRejectedValue(new Error('network unavailable'));
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(mocks.releaseEntitySession).toHaveBeenCalledWith({
      role: 'staff',
      entityId: 'staff-1',
      sessionId: 'session-1',
      uid: 'staff-login-user'
    });
    expect(props.setGarage).not.toHaveBeenCalled();
    expect(props.setCurrentStaff).not.toHaveBeenCalled();
    expect(props.setView).not.toHaveBeenCalled();
  });
});
