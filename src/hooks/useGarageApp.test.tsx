import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setters: new Map<string, ReturnType<typeof vi.fn>>(),
  showToast: vi.fn(),
  setUser: vi.fn(),
  handleLogout: vi.fn(),
  handleInitiateLogout: vi.fn(),
  handleCheckIn: vi.fn(),
  confirmCheckOut: vi.fn(),
  handleDeleteVehicle: vi.fn(),
  handleDelegateRecharge: vi.fn(),
  handleDelegateBalanceTopupRequest: vi.fn(),
  handleGarageLogin: vi.fn(),
  handleDelegateLogin: vi.fn(),
  deleteGarage: vi.fn(),
  updateGarageRate: vi.fn(),
  createNewGarage: vi.fn(),
  addDelegate: vi.fn(),
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
      app_supervisor: null,
      app_wallet_number: '',
      app_selected_garage_details: null,
      app_selected_delegate_details: null,
      app_show_packages: false,
      app_show_staff_stats: false,
      app_show_subscribers: false
    };
    return [values[key] ?? initial, mocks.setters.get(key)];
  })
}));
vi.mock('./useOnlineStatus', () => ({ useOnlineStatus: () => ({ isOnline: true, showOfflineScreen: false }) }));
vi.mock('./useServerTime', () => ({ useServerTime: () => ({ now: new Date('2026-10-18T10:00:00.000Z') }) }));
vi.mock('./useSystemSubscribersFlatFee', () => ({
  useSystemSubscribersFlatFee: () => 250,
  useSystemReferralFee: () => 50,
  useSystemDelegateCommissions: () => ({ daily: 5, weekly: 15, biweekly: 25, monthly: 50 })
}));
vi.mock('../utils/sounds', () => ({ soundManager: { play: vi.fn(), resume: vi.fn() } }));
vi.mock('../store/appStore', () => ({ useAppStore: { getState: () => ({ showToast: vi.fn(), setGarages: vi.fn(), setPackages: vi.fn(), setDelegates: vi.fn() }) } }));
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
vi.mock('./useGarageSubscription', () => ({
  useGarageSubscription: () => ({
    handleDelegateRecharge: mocks.handleDelegateRecharge,
    handleDelegateBalanceTopupRequest: mocks.handleDelegateBalanceTopupRequest
  })
}));
vi.mock('./useAdminAndGarageManagement', () => ({
  useAdminAndGarageManagement: () => ({
    handleGarageLogin: mocks.handleGarageLogin,
    handleDelegateLogin: mocks.handleDelegateLogin,
    createNewGarage: mocks.createNewGarage,
    deleteGarage: mocks.deleteGarage,
    updateGarageRate: mocks.updateGarageRate,
    addDelegate: mocks.addDelegate,
    removeDelegate: mocks.removeDelegate
  })
}));
vi.mock('./useGarageSync', () => ({
  useGarageSync: () => ({
    allGarages: [], delegates: [], staffList: [], setStaffList: vi.fn(), rechargeRequests: [],
    adminRechargeHasMore: false, adminRechargeListsLoading: false, loadMoreAdminRechargeRequests: vi.fn(),
    markAdminRechargeRequestResolved: vi.fn(), delegateRequests: [], delegatePagination: {},
    delegateListsLoading: false, loadMoreDelegateGarages: vi.fn(), loadMoreDelegateRequests: vi.fn(),
    packages: [], delegateGarages: [], sortedPackages: [], adminGarageHasMore: false,
    adminDelegateHasMore: false, adminListsLoading: false, adminListsError: false, adminSummary: null,
    loadMoreAdminGarages: vi.fn(), loadMoreAdminDelegates: vi.fn(), refreshAdminLists: vi.fn()
  })
}));
vi.mock('./useGarageSystemConfigSync', () => ({ useGarageSystemConfigSync: vi.fn() }));
vi.mock('../services', () => ({ firestoreService: { subscribeToAdminPin: vi.fn(() => vi.fn()) } }));

import { useGarageApp } from './useGarageApp';

afterEach(() => cleanup());

describe('useGarageApp grouped contract', () => {
  it('returns six stable groups while preserving flat aliases and handler identity', () => {
    const { result } = renderHook(() => useGarageApp());
    const app = result.current;

    expect(Object.keys(app).filter((key) => ['session', 'navigationUi', 'garageData', 'vehicleOperations', 'subscriptions', 'adminManagement'].includes(key))).toHaveLength(6);
    expect(app.session.handleLogout).toBe(app.handleLogout);
    expect(app.session.setUser).toBe(app.setUser);
    expect(app.navigationUi.setView).toBe(app.setView);
    expect(app.garageData.setGarage).toBe(app.setGarage);
    expect(app.vehicleOperations.handleCheckIn).toBe(app.handleCheckIn);
    expect(app.subscriptions.handleDelegateRecharge).toBe(app.handleDelegateRecharge);
    expect(app.adminManagement.handleGarageLogin).toBe(app.handleGarageLogin);
  });
});
