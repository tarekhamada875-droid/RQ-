import { useState, useEffect, useRef, useCallback } from 'react';
import { Garage, Vehicle, Staff, Supervisor } from '../types';
import { firestoreService } from '../services';
import type { GarageDeletionProgress } from '../services/garageService';
import { useLocalStorageState } from './useLocalStorage';
import { useOnlineStatus } from './useOnlineStatus';
import { useServerTime } from './useServerTime';
import { useSystemSubscribersFlatFee, useSystemReferralFee, useSystemDelegateCommissions } from './useSystemSubscribersFlatFee';
import { soundManager } from '../utils/sounds';
import { useAppStore } from '../store/appStore';

import { useGarageSession } from './useGarageSession';
import { useVehicleOperations } from './useVehicleOperations';
import { useGarageSubscription } from './useGarageSubscription';
import { useAdminAndGarageManagement } from './useAdminAndGarageManagement';
import { useGarageSync } from './useGarageSync';
import { useSystemConfig } from './useSystemConfig';

const CURRENT_VERSION = '1.0.4';

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
  const subscriberFlatFee = useSystemSubscribersFlatFee();
  const systemReferralFee = useSystemReferralFee();
  const delegateCommissions = useSystemDelegateCommissions();
  const [view, setView] = useLocalStorageState<'login' | 'garage' | 'admin_login' | 'admin_dashboard' | 'admin_garage_details' | 'admin_delegate_details' | 'delegate_login' | 'delegate_dashboard' | 'packages' | 'staff_stats'>('app_view', 'login');

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
  const [currentSupervisor, setCurrentSupervisor] = useLocalStorageState<Supervisor | null>('app_supervisor', null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [todayTransactions, setTodayTransactions] = useState<Vehicle[]>([]);
  const [adminPin, setAdminPin] = useState<string>('');
  const [activeAdminPin, setActiveAdminPin] = useState<string>('');
  const [walletNumber, setWalletNumber] = useLocalStorageState<string>('app_wallet_number', '015 - 524 - 113 - 23');
  const [subscriptionPrices, setSubscriptionPrices] = useState<{ weekly: number; biweekly?: number; monthly: number; weeklyDiscount?: number; biweeklyDiscount?: number; monthlyDiscount?: number }>({ weekly: 800, biweekly: 1500, monthly: 3000 });
  const [loginPhone, setLoginPhone] = useState<string>('');

  const [selectedGarageForDetails, setSelectedGarageForDetails] = useLocalStorageState<Garage | null>('app_selected_garage_details', null);
  const [selectedDelegateForDetails, setSelectedDelegateForDetails] = useLocalStorageState<any | null>('app_selected_delegate_details', null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [garageDeletionProgress, setGarageDeletionProgress] = useState<GarageDeletionProgress | null>(null);

  const [showPackages, setShowPackages] = useLocalStorageState<boolean>('app_show_packages', false);
  const [showStaffStats, setShowStaffStats] = useLocalStorageState<boolean>('app_show_staff_stats', false);
  const [showSubscribers, setShowSubscribers] = useLocalStorageState<boolean>('app_show_subscribers', false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const plateInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const garageRef = useRef<Garage | null>(null);
  const lastHealTimeRef = useRef<{ cars?: number; revenue?: number }>({});

  useEffect(() => {
    garageRef.current = garage;
  }, [garage]);

  const { now } = useServerTime();
  const { isOnline, showOfflineScreen } = useOnlineStatus();

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', silent: boolean = false) => {
    if (type === 'error' && !silent) soundManager.play('error');
    setToast({ message, type });
    useAppStore.getState().showToast(message, type as any);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const closeKeyboard = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsInputFocused(false);
  }, []);

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
  const {
    user,
    setUser,
    isAuthReady,
    sessionId,
    isSessionReady,
    showLogoutConfirm,
    setShowLogoutConfirm,
    handleLogout,
    handleInitiateLogout,
  } = useGarageSession({
    view,
    setView,
    garage,
    setGarage,
    delegate,
    setDelegate,
    currentStaff,
    setCurrentStaff,
    currentSupervisor,
    setCurrentSupervisor,
    showToast,
  });

  // 2. Data Sync Hook
  const {
    allGarages,
    delegates,
    supervisors,
    staffList,
    rechargeRequests,
    delegateRequests,
    packages,
    delegateGarages,
    sortedPackages,
  } = useGarageSync({
    isSessionReady,
    isAuthReady,
    user,
    view,
    garage,
    setGarage,
    delegate,
    setDelegate,
    selectedGarageForDetails,
    setSelectedGarageForDetails,
    setVehicles,
    setTodayTransactions,
    garageRef,
    lastHealTimeRef,
  });

  useEffect(() => {
    useAppStore.getState().setGarages(allGarages);
  }, [allGarages]);

  useEffect(() => {
    useAppStore.getState().setPackages(packages);
  }, [packages]);

  useEffect(() => {
    useAppStore.getState().setDelegates(delegates);
  }, [delegates]);

  // Admin PIN Sync (only active during admin dashboard sessions)
  useEffect(() => {
    if (!user || (!view.startsWith('admin_') && view !== 'admin_dashboard')) return;
    const unsub = firestoreService.subscribeToAdminPin((pin) => {
      setActiveAdminPin(pin);
    });
    return () => unsub();
  }, [user, view, setActiveAdminPin]);

  // System Config Sync (Wallet & Prices) via shared singleton
  const systemConfig = useSystemConfig();
  useEffect(() => {
    if (systemConfig) {
      if (systemConfig.walletNumber) setWalletNumber(systemConfig.walletNumber);
      if (systemConfig.subscriptionPrices) setSubscriptionPrices(systemConfig.subscriptionPrices as any);
    }
  }, [systemConfig, setWalletNumber]);

  // 3. Vehicle Operations Hook
  const {
    newPlateNumber,
    setNewPlateNumber,
    selectedVehicle,
    setSelectedVehicle,
    showCheckInModal,
    setShowCheckInModal,
    showCheckOutModal,
    setShowCheckOutModal,
    isLoading,
    setIsLoading,
    loadingType,
    setLoadingType,
    showRecentExitWarning,
    setShowRecentExitWarning,
    recentVehicle,
    setRecentVehicle,
    showSubscriberWarning,
    setShowSubscriberWarning,
    subscriberWarningPlate,
    setSubscriberWarningPlate,
    pendingCheckInType,
    setPendingCheckInType,
    handleCheckIn,
    confirmCheckOut,
    handleDeleteVehicle,
  } = useVehicleOperations({
    garage,
    currentStaff,
    vehicles,
    setVehicles,
    todayTransactions,
    isOnline,
    now,
    showToast,
    closeKeyboard,
  });

  // 4. Subscriptions & Recharge Hook
  const { handleDelegateRecharge, handleDelegateBalanceTopupRequest } = useGarageSubscription({
    allGarages,
    delegate,
    subscriberFlatFee,
    systemReferralFee,
    delegateCommissions,
    isOnline,
    showToast,
  });

  // 5. Admin and Garage Management Hook
  const {
    handleGarageLogin,
    handleDelegateLogin,
    createNewGarage,
    deleteGarage,
    updateGarageRate,
    addDelegate,
    removeDelegate,
  } = useAdminAndGarageManagement({
    allGarages,
    packages,
    delegate,
    currentSupervisor,
    loginPhone,
    setLoginPhone,
    setAdminPin,
    setActiveAdminPin,
    setUser,
    setGarage,
    setDelegate,
    setCurrentStaff,
    setCurrentSupervisor,
    setSelectedGarageForDetails,
    setView,
    setIsLoading,
    setShowDeleteConfirm,
    setGarageDeletionProgress,
    sessionId,
    isOnline,
    isLoading,
    closeKeyboard,
    showToast,
  });

  return {
    user,
    setUser,
    isAuthReady,
    isLandscapeMobile,
    view,
    setView,
    garage,
    setGarage,
    delegate,
    setDelegate,
    delegates,
    vehicles,
    todayTransactions,
    allGarages,
    packages,
    adminPin,
    setAdminPin,
    activeAdminPin,
    walletNumber,
    subscriptionPrices,
    loginPhone,
    setLoginPhone,
    showCheckInModal,
    setShowCheckInModal,
    showCheckOutModal,
    setShowCheckOutModal,
    selectedVehicle,
    setSelectedVehicle,
    newPlateNumber,
    setNewPlateNumber,
    plateInputRef,
    isLoading,
    setIsLoading,
    loadingType,
    setLoadingType,
    selectedGarageForDetails,
    setSelectedGarageForDetails,
    selectedDelegateForDetails,
    setSelectedDelegateForDetails,
    showDeleteConfirm,
    setShowDeleteConfirm,
    garageDeletionProgress,
    showLogoutConfirm,
    setShowLogoutConfirm,
    showPackages,
    setShowPackages,
    showStaffStats,
    setShowStaffStats,
    showSubscribers,
    setShowSubscribers,
    currentSupervisor,
    supervisors,
    isInputFocused,
    setIsInputFocused,
    staffList,
    rechargeRequests,
    delegateRequests,
    currentStaff,
    setCurrentStaff,
    sessionId,
    toast,
    setToast,
    showRecentExitWarning,
    setShowRecentExitWarning,
    recentVehicle,
    setRecentVehicle,
    showSubscriberWarning,
    setShowSubscriberWarning,
    subscriberWarningPlate,
    setSubscriberWarningPlate,
    pendingCheckInType,
    setPendingCheckInType,
    now,
    isOnline,
    showOfflineScreen,
    inputRef,
    sortedPackages,
    delegateGarages,
    showToast,
    handleLogout,
    handleInitiateLogout,
    closeKeyboard,
    handleGarageLogin,
    handleDelegateLogin,
    handleDelegateRecharge,
    handleDelegateBalanceTopupRequest,
    handleCheckIn,
    confirmCheckOut,
    handleDeleteVehicle,
    deleteGarage,
    updateGarageRate,
    createNewGarage,
    addDelegate,
    removeDelegate
  };
}
