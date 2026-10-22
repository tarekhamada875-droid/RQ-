import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Garage, Vehicle, Package, Staff } from '../types';
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
}: UseGarageSyncProps) {
  const [allGarages, setAllGarages] = useState<Garage[]>([]);
  const [delegates, setDelegates] = useState<any[]>([]);
  const [adminGarageHasMore, setAdminGarageHasMore] = useState(false);
  const [adminDelegateHasMore, setAdminDelegateHasMore] = useState(false);
  const [adminListsLoading, setAdminListsLoading] = useState(false);
  const [adminListsError, setAdminListsError] = useState(false);
  const adminGarageCursorRef = useRef<any>(null);
  const adminDelegateCursorRef = useRef<any>(null);
  const adminGarageLoadingRef = useRef(false);
  const adminDelegateLoadingRef = useRef(false);
  const adminListsLoadedRef = useRef(false);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [delegatePagination, setDelegatePagination] = useState({
    createdGarages: { hasMore: false, nextCursor: null as string | null },
    referredGarages: { hasMore: false, nextCursor: null as string | null },
  });
  const [delegateListsLoading, setDelegateListsLoading] = useState(false);
  const delegatePageLoadingRef = useRef<Record<'createdGarages' | 'referredGarages', boolean>>({ createdGarages: false, referredGarages: false });
  const delegateDashboardOwnerRef = useRef<string | undefined>(undefined);
  const delegateDashboardLoadedOwnerRef = useRef<string | undefined>(undefined);
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

  // Clear garage-scoped data before a different owner or role can render it.
  // The active owner's subscriptions repopulate these lists after the reset.
  useEffect(() => {
    setVehicles([]);
    setTodayTransactions([]);
    setStaffList([]);
  }, [view, garage?.id, user?.uid, isSessionReady, setVehicles, setTodayTransactions]);

  // Subscribe to Active Vehicles
  useEffect(() => {
    if (!isSessionReady || !garage?.id) {
      return;
    }
    const throttledVehicleUpdate = throttleSnapshot((activeVehicles: Vehicle[]) => {
      setVehicles(activeVehicles);
    }, 100);

    const unsub = firestoreService.subscribeToActiveVehicles(garage.id, (activeVehicles) => {
      throttledVehicleUpdate(activeVehicles);
    });
    return () => {
      throttledVehicleUpdate.cancel();
      unsub();
    };
  }, [isSessionReady, garage?.id, setVehicles]);

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

  const refreshAdminLists = useCallback(async () => {
    if (adminListsLoadedRef.current && adminListsLoading) return;
    adminListsLoadedRef.current = true;
    adminGarageCursorRef.current = null;
    adminDelegateCursorRef.current = null;
    setAdminGarageHasMore(false);
    setAdminDelegateHasMore(false);
    await Promise.all([loadAdminGaragePage(true), loadAdminDelegatePage(true)]);
  }, [adminListsLoading, loadAdminDelegatePage, loadAdminGaragePage]);

  // Sync delegate dashboard garage lists
  const delegateId = delegate?.id;
  useEffect(() => {
    if (!isAuthReady || !user || !delegateId || view !== 'delegate_dashboard') return;

    const isNewDelegate = delegateDashboardOwnerRef.current !== delegateId;
    if (isNewDelegate) {
      delegateDashboardOwnerRef.current = delegateId;
      delegateDashboardLoadedOwnerRef.current = undefined;
      setAllGarages([]);
      setDelegatePagination({
        createdGarages: { hasMore: false, nextCursor: null },
        referredGarages: { hasMore: false, nextCursor: null },
      });
    }

    let cancelled = false;
    const loadDashboard = async () => {
      try {
        const data = await firestoreService.getDashboardData(delegateId);
        if (cancelled || delegateDashboardOwnerRef.current !== delegateId) return;
        setDelegate(data.delegate);
        if (delegateDashboardLoadedOwnerRef.current !== delegateId) {
          delegateDashboardLoadedOwnerRef.current = delegateId;
          setAllGarages(data.garages as Garage[]);
          setDelegatePagination(data.pagination || {
            createdGarages: { hasMore: false, nextCursor: null },
            referredGarages: { hasMore: false, nextCursor: null },
              });
        } else {
          setAllGarages((previous) => Array.from(new Map([...previous, ...(data.garages as Garage[])].map((garage) => [garage.id, garage])).values()));
        }
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

  const loadMoreDelegateSection = useCallback(async (section: 'createdGarages' | 'referredGarages') => {
    const page = delegatePagination[section];
    if (!delegateId || !page.hasMore || !page.nextCursor || delegatePageLoadingRef.current[section]) return;
    delegatePageLoadingRef.current[section] = true;
    setDelegateListsLoading(true);
    try {
      const nextPage = await firestoreService.getDashboardDataPage(delegateId, section, page.nextCursor);
      if (delegateDashboardOwnerRef.current !== delegateId) return;
      setAllGarages((previous) => Array.from(new Map([...previous, ...nextPage.items].map((garage) => [garage.id, garage])).values()));
      setDelegatePagination((previous) => ({ ...previous, [section]: { hasMore: nextPage.hasMore, nextCursor: nextPage.nextCursor } }));
    } catch (error) {
      console.error(`[useGarageSync] Failed to load delegate ${section} page:`, error);
    } finally {
      delegatePageLoadingRef.current[section] = false;
      setDelegateListsLoading(Object.values(delegatePageLoadingRef.current).some(Boolean));
    }
  }, [delegateId, delegatePagination]);

  const loadMoreDelegateGarages = useCallback(async () => {
    await loadMoreDelegateSection('createdGarages');
    await loadMoreDelegateSection('referredGarages');
  }, [loadMoreDelegateSection]);

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
    let cancelled = false;
    const fetchSpecificData = async () => {
      try {
        const [staffData, garageData] = await Promise.all([
          firestoreService.getStaffByGarageOnce(garageId),
          firestoreService.getGarageById(garageId)
        ]);
        if (cancelled) return;
        setStaffList(staffData);
        if (garageData) setSelectedGarageForDetails(garageData);
      } catch (err) {
        console.error('Admin garage details fetch error:', err);
      }
    };

    fetchSpecificData();
    return () => {
      cancelled = true;
    };
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
    loadMoreAdminGarages: () => loadAdminGaragePage(false),
    loadMoreAdminDelegates: () => loadAdminDelegatePage(false),
    refreshAdminLists,
    staffList,
    setStaffList,
    delegatePagination,
    delegateListsLoading,
    loadMoreDelegateGarages,
    packages,
    setPackages,
    loadGarageData,
    delegateGarages,
    sortedPackages,
  };
}
