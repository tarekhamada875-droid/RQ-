import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAndGarageManagement } from './useAdminAndGarageManagement';

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

vi.mock('../services', () => ({ firestoreService: {} }));
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
  showToast: vi.fn()
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useAdminAndGarageManagement staff login garage read (FE-004)', () => {
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

  it('preserves the missing-garage behavior without performing a second read', async () => {
    mocks.getDoc.mockResolvedValue(createSnapshot(false));
    const props = createProps();
    const { result } = renderHook(() => useAdminAndGarageManagement(props));

    await act(async () => {
      await result.current.handleGarageLogin();
    });

    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    expect(props.setGarage).not.toHaveBeenCalled();
    expect(props.setCurrentStaff).toHaveBeenCalledWith({
      id: 'staff-1',
      garageId: 'garage-1',
      name: 'Test Staff'
    });
    expect(props.setView).toHaveBeenCalledWith('garage');
  });
});
