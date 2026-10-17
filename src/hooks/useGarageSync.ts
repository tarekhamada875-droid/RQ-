import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Garage, Vehicle, Package, Staff, RechargeRequest } from '../types';
import { firestoreService } from '../services';
import { throttleSnapshot } from '../utils';

const requestDateMillis = (value: any): number => {
  try {
    if (value instanceof Date) return value.getTime();
    if (value && typeof value.toDate === 'function') return value.toDate().getTime();
    const millis = new Date(value).getTime();
    return Number.isFinite(millis) ? millis : 0;
  } catch {
    return 0;
  }
};

const mergeRechargeRequests = (current: RechargeRequest[], incoming: RechargeRequest[]): RechargeRequest[] => {
  const byId = new Map(current.map((request) => [request.id, request]));
  for (const request of incoming) byId.set(request.id, request);
  return Array.from(byId.values()).sort((left, right) => requestDateMillis(right.createdAt) - requestDateMillis(left.createdAt));
};

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
  const userId = user?.uid;
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
  const [adminRechargeHasMore, setAdminRechargeHasMore] = useState(false);
  const [adminRechargeListsLoading, setAdminRechargeListsLoading] = useState(false);
  const adminRechargeCursorRef = useRef<string | null>(null);
  const adminRechargeLoadingRef = useRef(false);
  const adminRechargeLoadedMoreRef = useRef(false);
  const adminRechargeOwnerRef = useRef<string | undefined>(undefined);
  const [delegateRequests, setDelegateRequests] = useState<RechargeRequest[]>([]);
  const [delegatePagination, setDelegatePagination] = useState({
    createdGarages: { hasMore: false, nextCursor: null as string | null },
    referredGarages: { hasMore: false, nextCursor: null as string | null },
    requests: { hasMore: false, nextCursor: null as string | null }
  });
  const [delegateListsLoading, setDelegateListsLoading] = useState(false);
  const delegatePageLoadingRef = useRef<Record<string, boolean>>({});
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

  const refreshAdminRechargeRequests = useCallback(async () => {
    if (adminRechargeLoadingRef.current) return;
    adminRechargeLoadingRef.current = true;
    setAdminRechargeListsLoading(true);
    try {
      const page = await firestoreService.getAdminRechargeRequestsPage(20, null);
      setRechargeRequests((previous) => mergeRechargeRequests(previous, page.requests));
      if (!adminRechargeLoadedMoreRef.current) adminRechargeCursorRef.current = page.lastDoc;
      setAdminRechargeHasMore(page.hasMore);
    } catch (error) {
      console.error('Failed to load Admin recharge-request page:', error);
    } finally {
      adminRechargeLoadingRef.current = false;
      setAdminRechargeListsLoading(false);
    }
  }, []);

  const loadMoreAdminRechargeRequests = useCallback(async () => {
    if (adminRechargeLoadingRef.current || !adminRechargeCursorRef.current || !adminRechargeHasMore) return;
    adminRechargeLoadingRef.current = true;
    setAdminRechargeListsLoading(true);
    adminRechargeLoadedMoreRef.current = true;
    try {
      const page = await firestoreService.getAdminRechargeRequestsPage(20, adminRechargeCursorRef.current);
      setRechargeRequests((previous) => mergeRechargeRequests(previous, page.requests));
      adminRechargeCursorRef.current = page.lastDoc;
      setAdminRechargeHasMore(page.hasMore);
    } catch (error) {
      console.error('Failed to load the next Admin recharge-request page:', error);
    } finally {
      adminRechargeLoadingRef.current = false;
      setAdminRechargeListsLoading(false);
    }
  }, [adminRechargeHasMore]);

  const markAdminRechargeRequestResolved = useCallback((requestId: string) => {
    setRechargeRequests((previous) => previous.filter((request) => request.id !== requestId));
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
    if (!isAuthReady || !userId) return;
    if (view !== 'admin_dashboard' && view !== 'admin_garage_details') return;

    if (adminRechargeOwnerRef.current !== userId) {
      adminRechargeOwnerRef.current = userId;
      adminRechargeLoadedMoreRef.current = false;
      adminRechargeCursorRef.current = null;
      setRechargeRequests([]);
      setAdminRechargeHasMore(false);
    }

    void refreshAdminRechargeRequests();
    const unsub = firestoreService.subscribeToPendingRechargeRequests((requests) => {
      setRechargeRequests((previous) => mergeRechargeRequests(previous, requests));
    });
    return () => unsub();
  }, [isAuthReady, userId, view, refreshAdminRechargeRequests]);

  // Sync delegate requests
  const delegateId = delegate?.id;
  useEffect(() => {
    if (!isAuthReady || !user || !delegateId || view !== 'delegate_dashboard') return;

    const isNewDelegate = delegateDashboardOwnerRef.current !== delegateId;
    if (isNewDelegate) {
      delegateDashboardOwnerRef.current = delegateId;
      delegateDashboardLoadedOwnerRef.current = undefined;
      setAllGarages([]);
      setDelegateRequests([]);
      setDelegatePagination({
        createdGarages: { hasMore: false, nextCursor: null },
        referredGarages: { hasMore: false, nextCursor: null },
        requests: { hasMore: false, nextCursor: null }
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
          setDelegateRequests(data.requests);
          setDelegatePagination(data.pagination || {
            createdGarages: { hasMore: false, nextCursor: null },
            referredGarages: { hasMore: false, nextCursor: null },
            requests: { hasMore: false, nextCursor: null }
          });
        } else {
          setAllGarages((previous) => Array.from(new Map([...previous, ...(data.garages as Garage[])].map((garage) => [garage.id, garage])).values()));
          setDelegateRequests((previous) => Array.from(new Map([...previous, ...data.requests].map((request) => [request.id, request])).values()));
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

  const loadMoreDelegateSection = useCallback(async (section: 'createdGarages' | 'referredGarages' | 'requests') => {
    const page = delegatePagination[section];
    if (!delegateId || !page.hasMore || !page.nextCursor || delegatePageLoadingRef.current[section]) return;
    delegatePageLoadingRef.current[section] = true;
    setDelegateListsLoading(true);
    try {
      const nextPage = await firestoreService.getDashboardDataPage(delegateId, section, page.nextCursor);
      if (delegateDashboardOwnerRef.current !== delegateId) return;
      if (section === 'requests') {
        setDelegateRequests((previous) => Array.from(new Map([...previous, ...(nextPage.items as RechargeRequest[])].map((request) => [request.id, request])).values()));
      } else {
        setAllGarages((previous) => Array.from(new Map([...previous, ...(nextPage.items as Garage[])].map((garage) => [garage.id, garage])).values()));
      }
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
  const loadMoreDelegateRequests = useCallback(() => loadMoreDelegateSection('requests'), [loadMoreDelegateSection]);

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
    adminRechargeHasMore,
    adminRechargeListsLoading,
    loadMoreAdminRechargeRequests,
    markAdminRechargeRequestResolved,
    delegateRequests,
    delegatePagination,
    delegateListsLoading,
    loadMoreDelegateGarages,
    loadMoreDelegateRequests,
    packages,
    setPackages,
    loadGarageData,
    delegateGarages,
    sortedPackages,
  };
}
