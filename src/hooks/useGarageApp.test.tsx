import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './toast';
import { GarageInputProvider } from './garageInput';
import { ServerTimeProvider } from './serverTimeContext';

const mocks = vi.hoisted(() => ({
  setters: new Map<string, ReturnType<typeof vi.fn>>(),
  showToast: vi.fn(),
  setUser: vi.fn(),
  handleLogout: vi.fn(),
  handleInitiateLogout: vi.fn(),
  handleCheckIn: vi.fn(),
  confirmCheckOut: vi.fn(),
  handleDeleteVehicle: vi.fn(),
  handleGarageLogin: vi.fn(),
  handleDelegateLogin: vi.fn(),
  deleteGarage: vi.fn(),
  createNewGarage: vi.fn(),
  removeDelegate: vi.fn()
}));

vi.mock('./useLocalStorage', () => ({
  useLocalStorageState: vi.fn((key: string, initial: unknown) => {
    if (!mocks.setters.has(key)) mocks.setters.set(key, vi.fn());
    const values: Record<string, unknown> = {
      app_view: 'login',
      app_garage: null,
      app_delegate: null,
      app_staff: null,
      app_selected_garage_details: null,
      app_selected_delegate_details: null,
      app_show_subscribers: false
    };
    return [values[key] ?? initial, mocks.setters.get(key)];
  })
}));
vi.mock('./useOnlineStatus', () => ({ useOnlineStatus: () => ({ isOnline: true, showOfflineScreen: false }) }));
vi.mock('./useServerTime', () => ({ useServerTime: () => ({ now: new Date('2026-10-18T10:00:00.000Z') }) }));
vi.mock('../utils/sounds', () => ({ soundManager: { play: vi.fn(), resume: vi.fn() } }));
vi.mock('../store/appStore', () => ({ useAppStore: { getState: () => ({ showToast: vi.fn() }) } }));
vi.mock('./useGarageSession', () => ({
  useGarageSession: () => ({
    user: { uid: 'user-1' },
    setUser: mocks.setUser,
    isAuthReady: true,
    sessionId: 'session-1',
    isSessionReady: true,
    showLogoutConfirm: false,
    setShowLogoutConfirm: vi.fn(),
    handleLogout: mocks.handleLogout,
    handleInitiateLogout: mocks.handleInitiateLogout
  })
}));
vi.mock('./useVehicleOperations', () => ({
  useVehicleOperations: () => ({
    newPlateNumber: '',
    setNewPlateNumber: vi.fn(),
    selectedVehicle: null,
    setSelectedVehicle: vi.fn(),
    showCheckInModal: false,
    setShowCheckInModal: vi.fn(),
    showCheckOutModal: false,
    setShowCheckOutModal: vi.fn(),
    isLoading: false,
    setIsLoading: vi.fn(),
    loadingType: null,
    setLoadingType: vi.fn(),
    showRecentExitWarning: false,
    setShowRecentExitWarning: vi.fn(),
    recentVehicle: null,
    setRecentVehicle: vi.fn(),
    showSubscriberWarning: false,
    setShowSubscriberWarning: vi.fn(),
    subscriberWarningPlate: '',
    setSubscriberWarningPlate: vi.fn(),
    pendingCheckInType: null,
    setPendingCheckInType: vi.fn(),
    handleCheckIn: mocks.handleCheckIn,
    confirmCheckOut: mocks.confirmCheckOut,
    handleDeleteVehicle: mocks.handleDeleteVehicle
  })
}));
vi.mock('./useAdminAndGarageManagement', () => ({
  useAdminAndGarageManagement: () => ({
    handleGarageLogin: mocks.handleGarageLogin,
    handleDelegateLogin: mocks.handleDelegateLogin,
    createNewGarage: mocks.createNewGarage,
    deleteGarage: mocks.deleteGarage,
    removeDelegate: mocks.removeDelegate
  })
}));
vi.mock('./useGarageSync', () => ({
  useGarageSync: () => ({
    allGarages: [], delegates: [], staffList: [], setStaffList: vi.fn(), delegatePagination: {},
    delegateListsLoading: false, loadMoreDelegateGarages: vi.fn(),
    delegateGarages: [], adminGarageHasMore: false,
    adminDelegateHasMore: false, adminListsLoading: false, adminListsError: false,
    loadMoreAdminGarages: vi.fn(), loadMoreAdminDelegates: vi.fn(), refreshAdminLists: vi.fn()
  })
}));
vi.mock('../services', () => { const _svc = { subscribeToAdminPin: vi.fn(() => vi.fn()) }; return { firestoreService: _svc, garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });

import { useGarageApp } from './useGarageApp';

afterEach(() => cleanup());

describe('useGarageApp composition root', () => {
  it('returns exactly five stable groups (no flat aliases)', () => {
    const { result } = renderHook(() => useGarageApp(), { wrapper: ({ children }) => <ToastProvider><GarageInputProvider><ServerTimeProvider>{children}</ServerTimeProvider></GarageInputProvider></ToastProvider> });
    const app = result.current;

    // Exactly 5 keys, all of which are the named buckets.
    expect(Object.keys(app).sort()).toEqual(
      ['adminManagement', 'garageData', 'navigationUi', 'session', 'vehicleOperations'].sort(),
    );

    // Each bucket exposes its expected handler identity.
    expect(typeof app.session.handleLogout).toBe('function');
    expect(typeof app.navigationUi.setView).toBe('function');
    expect(typeof app.garageData.setGarage).toBe('function');
    expect(typeof app.vehicleOperations.handleCheckIn).toBe('function');
    expect(typeof app.adminManagement.handleGarageLogin).toBe('function');
  });
});
