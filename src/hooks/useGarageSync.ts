import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { Garage, Vehicle, Package, Staff, Supervisor } from '../types';
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
  currentStaff: Staff | null;
  currentSupervisor: Supervisor | null;
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
  currentStaff,
  currentSupervisor,
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
  const adminGarageRequestVersionRef = useRef(0);
  const adminDelegateRequestVersionRef = useRef(0);
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
  const delegateDashboardGenerationRef = useRef(0);
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

  // Keep transient garage data tied to the active role/entity, not just the shared garage ID.
  const isAdminView = view === 'admin_dashboard' || view.startsWith('admin_');
  const dataOwnerKey = view === 'garage'
    ? `garage:${garage?.id ?? ''}:staff:${currentStaff?.id ?? 'owner'}:user:${user?.uid ?? ''}`
    : view === 'delegate_dashboard'
      ? `delegate:${delegate?.id ?? ''}:user:${user?.uid ?? ''}`
      : isAdminView
        ? `admin:${currentSupervisor?.id ?? 'admin'}:user:${user?.uid ?? ''}`
        : `view:${view}:user:${user?.uid ?? ''}`;
  const previousDataOwnerKeyRef = useRef(dataOwnerKey);

  // Clear before paint when ownership changes; do not wipe retained data on initial mount.
  useLayoutEffect(() => {
    if (previousDataOwnerKeyRef.current === dataOwnerKey) return;
    previousDataOwnerKeyRef.current = dataOwnerKey;

    // Invalidate old-owner page requests before clearing their visible data. A late
    // response must not repopulate lists or restore cursors for the next protected view.
    adminGarageRequestVersionRef.current += 1;
    adminDelegateRequestVersionRef.current += 1;
    adminGarageCursorRef.current = null;
    adminDelegateCursorRef.current = null;
    adminGarageLoadingRef.current = false;
    adminDelegateLoadingRef.current = false;
    adminListsLoadedRef.current = false;
    delegateDashboardGenerationRef.current += 1;
    delegateDashboardOwnerRef.current = undefined;
    delegateDashboardLoadedOwnerRef.current = undefined;
    delegatePageLoadingRef.current = { createdGarages: false, referredGarages: false };

    setVehicles([]);
    setTodayTransactions([]);
    setStaffList([]);
    setAllGarages([]);
    setDelegates([]);
    setAdminGarageHasMore(false);
    setAdminDelegateHasMore(false);
    setAdminListsLoading(false);
    setAdminListsError(false);
    setDelegatePagination({
      createdGarages: { hasMore: false, nextCursor: null },
      referredGarages: { hasMore: false, nextCursor: null },
    });
    setDelegateListsLoading(false);
  }, [dataOwnerKey]);

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

  const staffLoadGenerationRef = useRef(0);
  const loadGarageData = useCallback(async (garageId: string) => {
    const requestGeneration = ++staffLoadGenerationRef.current;
    const ownerKey = dataOwnerKey;
    try {
      const staff = await firestoreService.getStaffByGarageOnce(garageId);
      if (
        requestGeneration !== staffLoadGenerationRef.current ||
        previousDataOwnerKeyRef.current !== ownerKey
      ) return;
      setStaffList(staff);
    } catch (err) {
      if (
        requestGeneration === staffLoadGenerationRef.current &&
        previousDataOwnerKeyRef.current === ownerKey
      ) {
        console.error('Failed to load garage data:', err);
      }
    }
  }, [dataOwnerKey, setStaffList]);

  // Staff reports depend on the current garage's staff roster. Hydrate it only
  // after the protected garage session is ready, and discard responses on switch/logout.
  useEffect(() => {
    if (!isSessionReady || view !== 'garage' || !garage?.id) {
      staffLoadGenerationRef.current += 1;
      return;
    }

    void loadGarageData(garage.id);
    return () => {
      staffLoadGenerationRef.current += 1;
    };
  }, [isSessionReady, view, garage?.id, loadGarageData]);

  const loadAdminGaragePage = useCallback(async (reset = false) => {
    if ((!reset && adminGarageLoadingRef.current) || (!reset && !adminGarageHasMore)) return;
    const requestVersion = reset
      ? ++adminGarageRequestVersionRef.current
      : adminGarageRequestVersionRef.current;
    adminGarageLoadingRef.current = true;
    setAdminListsLoading(true);
    if (reset) setAdminListsError(false);
    try {
      const page = await firestoreService.getAdminGaragesPage(50, reset ? null : adminGarageCursorRef.current);
      if (requestVersion !== adminGarageRequestVersionRef.current) return;
      setAllGarages((previous) => {
        const rows = reset ? page.garages : [...previous, ...page.garages];
        return Array.from(new Map(rows.map((garage) => [garage.id, garage])).values());
      });
      adminGarageCursorRef.current = page.lastDoc;
      setAdminGarageHasMore(page.hasMore);
    } catch (error) {
      if (requestVersion !== adminGarageRequestVersionRef.current) return;
      console.error('Failed to load admin garage page:', error);
      setAdminListsError(true);
    } finally {
      if (requestVersion === adminGarageRequestVersionRef.current) {
        adminGarageLoadingRef.current = false;
        setAdminListsLoading(adminDelegateLoadingRef.current);
      }
    }
  }, [adminGarageHasMore]);

  const loadAdminDelegatePage = useCallback(async (reset = false) => {
    if ((!reset && adminDelegateLoadingRef.current) || (!reset && !adminDelegateHasMore)) return;
    const requestVersion = reset
      ? ++adminDelegateRequestVersionRef.current
      : adminDelegateRequestVersionRef.current;
    adminDelegateLoadingRef.current = true;
    setAdminListsLoading(true);
    if (reset) setAdminListsError(false);
    try {
      const page = await firestoreService.getAdminDelegatesPage(50, reset ? null : adminDelegateCursorRef.current);
      if (requestVersion !== adminDelegateRequestVersionRef.current) return;
      setDelegates((previous) => {
        const rows = reset ? page.delegates : [...previous, ...page.delegates];
        return Array.from(new Map(rows.map((delegate) => [delegate.id, delegate])).values());
      });
      adminDelegateCursorRef.current = page.lastDoc;
      setAdminDelegateHasMore(page.hasMore);
    } catch (error) {
      if (requestVersion !== adminDelegateRequestVersionRef.current) return;
      console.error('Failed to load admin delegate page:', error);
      setAdminListsError(true);
    } finally {
      if (requestVersion === adminDelegateRequestVersionRef.current) {
        adminDelegateLoadingRef.current = false;
        setAdminListsLoading(adminGarageLoadingRef.current);
      }
    }
  }, [adminDelegateHasMore]);

  const refreshAdminLists = useCallback(async () => {
    // A reset must supersede any older page request, even when that request
    // is still in flight. The request-version guards prevent late pages from
    // restoring stale rows or cursors after a successful mutation.
    adminListsLoadedRef.current = true;
    adminGarageCursorRef.current = null;
    adminDelegateCursorRef.current = null;
    setAdminGarageHasMore(false);
    setAdminDelegateHasMore(false);
    await Promise.all([loadAdminGaragePage(true), loadAdminDelegatePage(true)]);
  }, [loadAdminDelegatePage, loadAdminGaragePage]);

  // Sync delegate dashboard garage lists
  const delegateId = delegate?.id;
  const delegateUserId = user?.uid;
  useEffect(() => {
    if (!isAuthReady || !delegateUserId || !delegateId || view !== 'delegate_dashboard') return;

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
    let dashboardRequestInFlight = false;
    const requestGeneration = ++delegateDashboardGenerationRef.current;

    // A previous delegate's pagination request must not leave the new dashboard
    // permanently marked as loading after a role/account switch. Avoid a redundant
    // state update on initial load; it can restart effects whose caller props are unstable.
    const hadPendingDelegatePage = Object.values(delegatePageLoadingRef.current).some(Boolean);
    delegatePageLoadingRef.current = { createdGarages: false, referredGarages: false };
    if (hadPendingDelegatePage) setDelegateListsLoading(false);

    const loadDashboard = async () => {
      // Polls are best-effort refreshes. Never let a slow request overlap the next
      // interval and then apply its older snapshot after a newer one.
      if (dashboardRequestInFlight) return;
      dashboardRequestInFlight = true;
      try {
        const data = await firestoreService.getDashboardData(delegateId);
        if (
          cancelled ||
          delegateDashboardGenerationRef.current !== requestGeneration ||
          delegateDashboardOwnerRef.current !== delegateId
        ) return;
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
        if (!cancelled && delegateDashboardGenerationRef.current === requestGeneration) {
          console.error('[useGarageSync] Failed to load delegate dashboard:', err);
        }
      } finally {
        dashboardRequestInFlight = false;
      }
    };

    void loadDashboard();
    const refresh = window.setInterval(loadDashboard, 15000);
    return () => {
      cancelled = true;
      if (delegateDashboardGenerationRef.current === requestGeneration) {
        delegateDashboardGenerationRef.current += 1;
      }
      window.clearInterval(refresh);
    };
  }, [isAuthReady, delegateUserId, delegateId, view]);

  const loadMoreDelegateSection = useCallback(async (
    section: 'createdGarages' | 'referredGarages',
    requestGeneration: number
  ) => {
    const page = delegatePagination[section];
    if (
      !delegateId ||
      requestGeneration !== delegateDashboardGenerationRef.current ||
      delegateDashboardOwnerRef.current !== delegateId ||
      !page.hasMore ||
      !page.nextCursor ||
      delegatePageLoadingRef.current[section]
    ) return;
    delegatePageLoadingRef.current[section] = true;
    setDelegateListsLoading(true);
    try {
      const nextPage = await firestoreService.getDashboardDataPage(delegateId, section, page.nextCursor);
      if (
        requestGeneration !== delegateDashboardGenerationRef.current ||
        delegateDashboardOwnerRef.current !== delegateId
      ) return;
      setAllGarages((previous) => Array.from(new Map([...previous, ...nextPage.items].map((garage) => [garage.id, garage])).values()));
      setDelegatePagination((previous) => ({ ...previous, [section]: { hasMore: nextPage.hasMore, nextCursor: nextPage.nextCursor } }));
    } catch (error) {
      if (requestGeneration === delegateDashboardGenerationRef.current) {
        console.error(`[useGarageSync] Failed to load delegate ${section} page:`, error);
      }
    } finally {
      if (requestGeneration === delegateDashboardGenerationRef.current) {
        delegatePageLoadingRef.current[section] = false;
        setDelegateListsLoading(Object.values(delegatePageLoadingRef.current).some(Boolean));
      }
    }
  }, [delegateId, delegatePagination]);

  const loadMoreDelegateGarages = useCallback(async () => {
    const requestGeneration = delegateDashboardGenerationRef.current;
    await loadMoreDelegateSection('createdGarages', requestGeneration);
    await loadMoreDelegateSection('referredGarages', requestGeneration);
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
