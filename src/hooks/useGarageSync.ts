import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Garage, Vehicle, Package, Staff, RechargeRequest } from '../types';
import { firestoreService } from '../services';
import { throttleSnapshot } from '../utils';

interface UseGarageSyncProps {
  isSessionReady: boolean;
  isAuthReady: boolean;
  user: any;
  view: string;
  garage: Garage | null;
  setGarage: (g: Garage | null) => void;
  delegate: any | null;
  setDelegate: (d: any | null) => void;
  selectedGarageForDetails: Garage | null;
  setSelectedGarageForDetails: (g: Garage | null) => void;
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  setTodayTransactions: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  garageRef: React.MutableRefObject<Garage | null>;
  lastHealTimeRef: React.MutableRefObject<{ cars?: number; revenue?: number }>;
}

export function useGarageSync({
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
  showToast,
  garageRef,
  lastHealTimeRef,
}: UseGarageSyncProps) {
  const [allGarages, setAllGarages] = useState<Garage[]>([]);
  const [delegates, setDelegates] = useState<any[]>([]);
  const [adminGarageHasMore, setAdminGarageHasMore] = useState(false);
  const [adminDelegateHasMore, setAdminDelegateHasMore] = useState(false);
  const [adminListsLoading, setAdminListsLoading] = useState(false);
  const [adminListsError, setAdminListsError] = useState(false);
  const [adminSummary, setAdminSummary] = useState<{
    totalGarages: number;
    activeGarages: number;
    lockedGarages: number;
    totalDelegates: number;
    totalAdminRevenue: number;
  } | null>(null);
  const adminGarageCursorRef = useRef<any>(null);
  const adminDelegateCursorRef = useRef<any>(null);
  const adminGarageLoadingRef = useRef(false);
  const adminDelegateLoadingRef = useRef(false);
  const adminListsLoadedRef = useRef(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [delegateRequests, setDelegateRequests] = useState<RechargeRequest[]>([]);
  const [packages, setPackages] = useState<Package[]>(() => {
    try {
      const cached = localStorage.getItem('app_packages_cache');
      if (cached) {
        let jsonStr = cached;
        const separatorIdx = cached.indexOf('|');
        if (separatorIdx !== -1) {
          jsonStr = cached.substring(separatorIdx + 1);
        }
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // A malformed cache is equivalent to having no cached vehicles.
    }
    return [];
  });

  // Subscribe to Active Vehicles
  useEffect(() => {
    if (!isSessionReady || !garage?.id) {
      return;
    }
    let hasReceivedInitialSnapshot = false;
    const throttledVehicleUpdate = throttleSnapshot((activeVehicles: Vehicle[]) => {
      setVehicles(activeVehicles);
      const currentGarage = garageRef.current;
      const now = Date.now();
      const isOnline = typeof navigator === 'undefined' || navigator.onLine;
      if (
        hasReceivedInitialSnapshot &&
        isOnline &&
        view === 'garage' &&
        currentGarage &&
        typeof currentGarage.carsInside === 'number' &&
        activeVehicles.length < 200 &&
        currentGarage.carsInside !== activeVehicles.length &&
        (!lastHealTimeRef.current.cars || now - lastHealTimeRef.current.cars > 30000)
      ) {
        lastHealTimeRef.current.cars = now;
        firestoreService.updateGarage(currentGarage.id, { carsInside: activeVehicles.length }).catch((err) => {
          console.warn('Failed to heal carsInside:', err);
        });
      }
      hasReceivedInitialSnapshot = true;
    }, 100);

    const unsub = firestoreService.subscribeToActiveVehicles(garage.id, (activeVehicles) => {
      throttledVehicleUpdate(activeVehicles);
    });
    return () => unsub();
  }, [isSessionReady, garage?.id, view, setVehicles, garageRef, lastHealTimeRef]);

  // Subscribe to completed transactions
  useEffect(() => {
    if (!isSessionReady || !garage?.id) {
      return;
    }
    const unsub = firestoreService.subscribeToTodayTransactions(garage.id, (completedTransactions, error) => {
      if (error) {
        showToast?.('تعذر تحديث سجل حركة اليوم. قد تكون البيانات المعروضة قديمة.', 'error');
        return;
      }
      setTodayTransactions(completedTransactions);
    });
    return () => unsub();
  }, [isSessionReady, garage?.id, setTodayTransactions, showToast]);

  const loadGarageData = useCallback(async (garageId: string) => {
    try {
      const staff = await firestoreService.getStaffByGarageOnce(garageId);
      setStaffList(staff);
    } catch (err) {
      console.error('Failed to load garage data:', err);
    }
  }, [setStaffList]);

  const loadAdminGaragePage = useCallback(async (reset = false) => {
    if (adminGarageLoadingRef.current || (!reset && !adminGarageHasMore)) return;
    adminGarageLoadingRef.current = true;
    setAdminListsLoading(true);
    setAdminListsError(false);
    try {
      const page = await firestoreService.getAdminGaragesPage(50, reset ? null : adminGarageCursorRef.current);
      setAllGarages((previous) => {
        const rows = reset ? page.garages : [...previous, ...page.garages];
        return Array.from(new Map(rows.map((garage) => [garage.id, garage])).values());
      });
      adminGarageCursorRef.current = page.lastDoc;
      setAdminGarageHasMore(page.hasMore);
    } catch (error) {
      console.error('Failed to load admin garage page:', error);
      setAdminListsError(true);
    } finally {
      adminGarageLoadingRef.current = false;
      setAdminListsLoading(false);
    }
  }, [adminGarageHasMore]);

  const loadAdminDelegatePage = useCallback(async (reset = false) => {
    if (adminDelegateLoadingRef.current || (!reset && !adminDelegateHasMore)) return;
    adminDelegateLoadingRef.current = true;
    setAdminListsLoading(true);
    setAdminListsError(false);
    try {
      const page = await firestoreService.getAdminDelegatesPage(50, reset ? null : adminDelegateCursorRef.current);
      setDelegates((previous) => {
        const rows = reset ? page.delegates : [...previous, ...page.delegates];
        return Array.from(new Map(rows.map((delegate) => [delegate.id, delegate])).values());
      });
      adminDelegateCursorRef.current = page.lastDoc;
      setAdminDelegateHasMore(page.hasMore);
    } catch (error) {
      console.error('Failed to load admin delegate page:', error);
      setAdminListsError(true);
    } finally {
      adminDelegateLoadingRef.current = false;
      setAdminListsLoading(false);
    }
  }, [adminDelegateHasMore]);

  const loadAdminSummary = useCallback(async () => {
    try {
      const summary = await firestoreService.getAdminSummary();
      setAdminSummary(summary);
    } catch (error) {
      console.error('Failed to load admin summary:', error);
      setAdminListsError(true);
    }
  }, []);

  const refreshAdminLists = useCallback(async () => {
    if (adminListsLoadedRef.current && adminListsLoading) return;
    adminListsLoadedRef.current = true;
    adminGarageCursorRef.current = null;
    adminDelegateCursorRef.current = null;
    setAdminGarageHasMore(false);
    setAdminDelegateHasMore(false);
    await Promise.all([loadAdminGaragePage(true), loadAdminDelegatePage(true), loadAdminSummary()]);
  }, [adminListsLoading, loadAdminDelegatePage, loadAdminGaragePage, loadAdminSummary]);

  // Sync Recharge Requests (Admin Only)
  useEffect(() => {
    if (!isAuthReady || !user) return;
    if (view !== 'admin_dashboard' && view !== 'admin_garage_details') return;

    const unsub = firestoreService.subscribeToPendingRechargeRequests((requests) => {
      setRechargeRequests(requests);
    });
    return () => unsub();
  }, [isAuthReady, user, view]);

  // Sync delegate requests
  const delegateId = delegate?.id;
  useEffect(() => {
    if (!isAuthReady || !user || !delegateId || view !== 'delegate_dashboard') return;

    let cancelled = false;
    const loadDashboard = async () => {
      try {
        const data = await firestoreService.getDashboardData(delegateId);
        if (cancelled) return;
        setDelegate(data.delegate);
        setAllGarages(data.garages as Garage[]);
        setDelegateRequests(data.requests);
      } catch (err) {
        console.error('[useGarageSync] Failed to load delegate dashboard:', err);
      }
    };

    void loadDashboard();
    const refresh = window.setInterval(loadDashboard, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [isAuthReady, user, delegateId, view]);

  // Sync packages independently (prevents redundant re-subscribing on view changes)
  useEffect(() => {
    if (!isAuthReady || !user) return;

    let cancelled = false;
    const unsubPackages = firestoreService.subscribeToPackages((pkgs) => {
      if (!cancelled) setPackages(Array.isArray(pkgs) ? pkgs : []);
    });

    return () => {
      cancelled = true;
      unsubPackages();
    };
  }, [isAuthReady, user]);

  // Sync bounded admin collections. Detail pages retain their own selected-document reads.
  useEffect(() => {
    if (!isSessionReady || !isAuthReady || !user) return;

    if ((view === 'admin_dashboard' || view === 'admin_garage_details' || view === 'admin_delegate_details') && !adminListsLoadedRef.current) {
      void refreshAdminLists();
    }

    const unsubCurrentGarage = (view === 'garage' && garage?.id)
      ? firestoreService.subscribeToGarage(garage.id, setGarage)
      : () => {};

    const unsubCurrentDelegate = () => {};

    return () => {
      unsubCurrentGarage();
      unsubCurrentDelegate();
    };
  }, [isSessionReady, isAuthReady, user, view, garage?.id, setGarage, refreshAdminLists]);

  // Load Admin specific garage details once
  useEffect(() => {
    if (!isAuthReady || !user || view !== 'admin_garage_details' || !selectedGarageForDetails?.id) return;

    const garageId = selectedGarageForDetails.id;
    const fetchSpecificData = async () => {
      try {
        const [staffData, garageData] = await Promise.all([
          firestoreService.getStaffByGarageOnce(garageId),
          firestoreService.getGarageById(garageId)
        ]);
        setStaffList(staffData);
        if (garageData) setSelectedGarageForDetails(garageData);
      } catch (err) {
        console.error('Admin garage details fetch error:', err);
      }
    };

    fetchSpecificData();
  }, [isAuthReady, user, view, selectedGarageForDetails?.id, setSelectedGarageForDetails]);

  const delegateGarages = useMemo(() => {
    if (!delegate) return [];
    return allGarages.filter(g => g.createdByDelegateId === delegate.id || g.referrerId === delegate.id);
  }, [allGarages, delegate]);

  const sortedPackages = useMemo(() => {
    const activePkgs = packages || [];
    return [...activePkgs].sort((a, b) => a.price - b.price);
  }, [packages]);

  return {
    allGarages,
    setAllGarages,
    delegates,
    setDelegates,
    adminGarageHasMore,
    adminDelegateHasMore,
    adminListsLoading,
    adminListsError,
    adminSummary,
    loadMoreAdminGarages: () => loadAdminGaragePage(false),
    loadMoreAdminDelegates: () => loadAdminDelegatePage(false),
    refreshAdminLists,
    staffList,
    setStaffList,
    rechargeRequests,
    delegateRequests,
    packages,
    setPackages,
    loadGarageData,
    delegateGarages,
    sortedPackages,
  };
}
