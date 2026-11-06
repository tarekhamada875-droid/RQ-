import { useState, useEffect, useCallback } from 'react';
import { Garage, Vehicle, Staff } from '../types';
import type { GarageDeletionProgress } from '../services/garageDeletionService';
import { useLocalStorageState } from './useLocalStorage';
import { useOnlineStatus } from './useOnlineStatus';
import { useToast } from './toast';
import { useGarageInput } from './garageInput';
import { soundManager } from '../utils/sounds';

import { useGarageSession } from './useGarageSession';
import { useVehicleOperations } from './useVehicleOperations';
import { useAdminAndGarageManagement } from './useAdminAndGarageManagement';
import { useGarageSync } from './useGarageSync';

const CURRENT_VERSION = '1.0.5';

/**
 * Composition root for the app's shared state.
 *
 * Wires together the four sub-hooks (session, sync, vehicle ops, admin
 * mutations) and returns them grouped into five buckets, each of which
 * is exposed to the component tree via a React context provider wired
 * in `App.tsx`:
 *
 *   - session          → SessionProvider          (PR 8)
 *   - navigationUi     → NavigationUiProvider     (PR 9)
 *   - garageData      → GarageDataProvider        (PR 9)
 *   - vehicleOperations → VehicleOpsProvider      (PR 5)
 *   - adminManagement → AdminMutationsProvider    (PR 9)
 *
 * Per the "Solid Before Launch" plan, the flat return-key aliases that
 * used to be here (~100 keys) have been removed — every consumer now
 * reads via the appropriate `use*()` context hook instead.
 */
export function useGarageApp() {
  // Clear App Cache upon Version Updates
  useEffect(() => {
    try {
      const savedVersion = localStorage.getItem('app_version');
      if (savedVersion && savedVersion !== CURRENT_VERSION) {
        localStorage.setItem('app_version', CURRENT_VERSION);
        localStorage.removeItem('app_view');
        window.location.reload();
      } else if (!savedVersion) {
        localStorage.setItem('app_version', CURRENT_VERSION);
      }
    } catch (e) {
      console.error('Cache error', e);
    }
  }, []);

  const [isLandscapeMobile, setIsLandscapeMobile] = useState(false);
  const [view, setView] = useLocalStorageState<'login' | 'garage' | 'admin_login' | 'admin_dashboard' | 'admin_garage_details' | 'admin_delegate_details' | 'delegate_login' | 'delegate_dashboard'>('app_view', 'login');

  // Hash Navigation Support
  useEffect(() => {
    const handleHash = () => {
      const hash = (window.location.hash || '').toLowerCase();
      if (hash === '#/admin' || hash === '#admin' || hash === '#/admin_login') {
        setView('admin_login');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [setView]);

  // Landscape Orientation Check
  useEffect(() => {
    const checkOrientation = () => {
      const isLandscape = window.innerWidth > window.innerHeight && window.innerWidth < 1024;
      setIsLandscapeMobile(isLandscape);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  const [garage, setGarage] = useLocalStorageState<Garage | null>('app_garage', null);
  const [delegate, setDelegate] = useLocalStorageState<any | null>('app_delegate', null);
  const [currentStaff, setCurrentStaff] = useLocalStorageState<Staff | null>('app_staff', null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [todayTransactions, setTodayTransactions] = useState<Vehicle[]>([]);

  const [loginPhone, setLoginPhone] = useState<string>('');

  const [selectedGarageForDetails, setSelectedGarageForDetails] = useLocalStorageState<Garage | null>('app_selected_garage_details', null);
  const [selectedDelegateForDetails, setSelectedDelegateForDetails] = useLocalStorageState<any | null>('app_selected_delegate_details', null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [garageDeletionProgress, setGarageDeletionProgress] = useState<GarageDeletionProgress | null>(null);

  const [showSubscribers, setShowSubscribers] = useLocalStorageState<boolean>('app_show_subscribers', false);

  const { closeKeyboard } = useGarageInput();

  const { isOnline, showOfflineScreen } = useOnlineStatus();

  const { showToast: contextShowToast } = useToast();

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', _silent: boolean = false) => {
    if (type === 'error') soundManager.play('error');
    contextShowToast(message, type);
  }, [contextShowToast]);

  // Warm up AudioContext on first interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      soundManager.resume();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);
    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, []);

  // 1. Session and Auth Hook
  const sessionHook = useGarageSession({
    view,
    setView,
    garage,
    setGarage,
    delegate,
    setDelegate,
    currentStaff,
    setCurrentStaff,
    showToast,
  });

  const session = {
    ...sessionHook,
    currentStaff,
    setCurrentStaff,
  };

  // 2. Data Sync Hook
  const syncData = useGarageSync({
    isSessionReady: session.isSessionReady,
    isAuthReady: session.isAuthReady,
    user: session.user,
    view,
    garage,
    setGarage,
    delegate,
    currentStaff,
    setDelegate,
    selectedGarageForDetails,
    setSelectedGarageForDetails,
    setVehicles,
    setTodayTransactions,
    showToast,
  });

  // 3. Vehicle Operations Hook
  const vehicleOperations = useVehicleOperations({
    garage,
    setGarage,
    currentStaff,
    vehicles,
    setVehicles,
    todayTransactions,
    isOnline,
    showToast,
    closeKeyboard,
  });

  // 4. Admin and Garage Management Hook
  const adminManagement = useAdminAndGarageManagement({
    allGarages: syncData.allGarages,
    delegate,
    loginPhone,
    setLoginPhone,
    setUser: session.setUser,
    setGarage,
    setDelegate,
    setCurrentStaff,
    setSelectedGarageForDetails,
    setView,
    setIsLoading: vehicleOperations.setIsLoading,
    setShowDeleteConfirm,
    setGarageDeletionProgress,
    sessionId: session.sessionId,
    isOnline,
    isLoading: vehicleOperations.isLoading,
    closeKeyboard,
    showToast,
    refreshAdminLists: syncData.refreshAdminLists,
  });

  const navigationUi = {
    isLandscapeMobile,
    view,
    setView,
    loginPhone,
    setLoginPhone,
    selectedGarageForDetails,
    setSelectedGarageForDetails,
    selectedDelegateForDetails,
    setSelectedDelegateForDetails,
    showDeleteConfirm,
    setShowDeleteConfirm,
    garageDeletionProgress,
    showSubscribers,
    setShowSubscribers,
    showToast,
    closeKeyboard,
    isOnline,
    showOfflineScreen,
  };

  const garageData = {
    ...syncData,
    garage,
    setGarage,
    delegate,
    setDelegate,
    vehicles,
    todayTransactions,
  };

  return {
    session,
    navigationUi,
    garageData,
    vehicleOperations,
    adminManagement,
  };
}

export type GarageAppState = ReturnType<typeof useGarageApp>;
