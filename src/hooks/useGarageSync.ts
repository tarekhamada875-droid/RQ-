import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { Garage, Vehicle, Staff } from '../types';
import { adminService, delegateService, garageService, vehicleService } from '../services';
import { throttleSnapshot } from '../utils/storage';

interface UseGarageSyncProps {
  isSessionReady: boolean;
  isAuthReady: boolean;
  user: any;
  view: string;
  garage: Garage | null;
  setGarage: React.Dispatch<React.SetStateAction<Garage | null>>;
  delegate: any | null;
  currentStaff: Staff | null;
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
  const [delegateListsError, setDelegateListsError] = useState(false);
  const [delegateDashboardLoading, setDelegateDashboardLoading] = useState(
    isSessionReady && isAuthReady && view === 'delegate_dashboard' && Boolean(delegate?.id && user?.uid)
  );
  const [delegateDashboardError, setDelegateDashboardError] = useState(false);
  const [delegateDashboardRetryVersion, setDelegateDashboardRetryVersion] = useState(0);
  const delegatePageLoadingRef = useRef<Record<'createdGarages' | 'referredGarages', boolean>>({ createdGarages: false, referredGarages: false });
  const delegateDashboardOwnerRef = useRef<string | undefined>(undefined);
  const delegateDashboardLoadedOwnerRef = useRef<string | undefined>(undefined);
  const delegateDashboardGenerationRef = useRef(0);
  // Packages state removed — feature retired by owner.

  // ── Initial sync gate (fixes reopen-refresh race) ────────────────────
  // The dashboard can render from persisted localStorage state as soon as
  // `isSessionReady` flips true, but Firestore listeners have NOT yet
  // delivered their first fresh (non-cached) snapshot. If the user starts
  // a check-in/out during that brief window, optimistic UI writes can be
  // clobbered by stale cached snapshots or by a queued first-snapshot
  // that pre-dates the user's write. To kill that race entirely, we gate
  // the dashboard on `isInitialSyncComplete`: it flips true only after
  // BOTH `subscribeToGarage` AND `subscribeToActiveVehicles` have
  // delivered at least one non-cached snapshot, OR after a 10-second
  // timeout (so a flaky network cannot permanently lock the user out).
  // Only the garage view is gated — admin/delegate views use different
  // listeners and are not affected by the original race.
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(false);
  const garageFreshSnapshotReceivedRef = useRef(false);
  const vehiclesFreshSnapshotReceivedRef = useRef(false);
  const initialSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INITIAL_SYNC_TIMEOUT_MS = 10_000;

  // Keep transient garage data tied to the active role/entity, not just the shared garage ID.
  const isAdminView = view === 'admin_dashboard' || view.startsWith('admin_');
  const dataOwnerKey = `${isSessionReady ? 'ready' : 'unready'}:` + (view === 'garage'
    ? `garage:${garage?.id ?? ''}:staff:${currentStaff?.id ?? 'owner'}:user:${user?.uid ?? ''}`
    : view === 'delegate_dashboard'
      ? `delegate:${delegate?.id ?? ''}:user:${user?.uid ?? ''}`
      : isAdminView
        ? `admin:auth-pin:user:${user?.uid ?? ''}`
        : `view:${view}:user:${user?.uid ?? ''}`);
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
    setDelegateListsError(false);
    setDelegateDashboardLoading(
      isSessionReady && isAuthReady && view === 'delegate_dashboard' && Boolean(delegate?.id && user?.uid)
    );
    setDelegateDashboardError(false);

    // Reset initial-sync gate on owner/view/garage change. The new view needs
    // its own first-fresh-snapshot from its own listeners before it can be
    // considered safe to interact with.
    garageFreshSnapshotReceivedRef.current = false;
    vehiclesFreshSnapshotReceivedRef.current = false;
    setIsInitialSyncComplete(false);
    if (initialSyncTimeoutRef.current) {
      clearTimeout(initialSyncTimeoutRef.current);
      initialSyncTimeoutRef.current = null;
    }
  }, [dataOwnerKey]);

  // Subscribe to Active Vehicles
  useEffect(() => {
    if (!isSessionReady || !garage?.id) {
      return;
    }
    let active = true;
    // Closure variable so the throttled callback can read the latest
    // `fromCache` value without changing throttleSnapshot's single-arg
    // signature.
    let latestFromCache = false;
    const throttledVehicleUpdate = throttleSnapshot((activeVehicles: Vehicle[]) => {
      if (!active) return;
      const fromCache = latestFromCache;
      // Merge: preserve optimistic vehicles that the server snapshot hasn't
      // confirmed yet. An optimistic vehicle (added during check-in) has an
      // entryTime that is a plain Date, not a Firestore Timestamp. If the
      // server snapshot doesn't include a vehicle with the same ID, keep the
      // optimistic one for up to 5 seconds (after that, assume it failed and
      // drop it). This prevents the "flip then disappear then reappear" flicker
      // where the throttled snapshot overwrites the optimistic update before
      // the server confirms it.
      //
      // CACHED-snapshot rule: if `fromCache === true`, the snapshot may be
      // stale (queued before the user's write committed). In that case we
      // ALWAYS keep optimistic vehicles regardless of age — the next fresh
      // snapshot is the only thing allowed to retire them.
      setVehicles((current) => {
        const serverIds = new Set(activeVehicles.map((v) => v.id));
        const now = Date.now();
        const optimisticKeep = current.filter((v) => {
          if (serverIds.has(v.id)) return false; // server has it, let server win
          if (fromCache) return true; // stale snapshot — never drop optimistic vehicles
          // Fresh snapshot still doesn't have the optimistic vehicle. Keep it
          // only if it's < 5s old (recent optimistic entry). Recognize Date,
          // Firestore Timestamp (toDate), AND ISO string (returned by Worker).
          const entryMs = v.entryTime instanceof Date
            ? v.entryTime.getTime()
            : (v.entryTime && typeof v.entryTime === 'object' && 'toDate' in v.entryTime && typeof v.entryTime.toDate === 'function') ? v.entryTime.toDate().getTime() : 0;
          const entryMsFromString = typeof v.entryTime === 'string' ? Date.parse(v.entryTime) : 0;
          const finalEntryMs = entryMs > 0 ? entryMs : entryMsFromString;
          return finalEntryMs > 0 && (now - finalEntryMs) < 5000;
        });
        return [...optimisticKeep, ...activeVehicles];
      });
    }, 150);

    const unsub = vehicleService.subscribeToActiveVehicles(garage.id, (activeVehicles, metadata) => {
      // Unsubscribe normally stops future snapshots, but an already queued callback
      // can still arrive after the garage/session changes. Never forward it.
      if (!active) return;
      latestFromCache = metadata?.fromCache ?? false;
      if (!latestFromCache && !vehiclesFreshSnapshotReceivedRef.current) {
        vehiclesFreshSnapshotReceivedRef.current = true;
        // Check if both listeners have delivered fresh data → flip the gate.
        if (garageFreshSnapshotReceivedRef.current) {
          setIsInitialSyncComplete(true);
          if (initialSyncTimeoutRef.current) {
            clearTimeout(initialSyncTimeoutRef.current);
            initialSyncTimeoutRef.current = null;
          }
        }
      }
      throttledVehicleUpdate(activeVehicles);
    });
    // 10-second safety timeout: if Firestore cannot deliver a fresh snapshot
    // (e.g. flaky network at reopen), unlock the dashboard anyway so the user
    // is not permanently blocked from working.
    if (!initialSyncTimeoutRef.current) {
      initialSyncTimeoutRef.current = setTimeout(() => {
        setIsInitialSyncComplete(true);
        initialSyncTimeoutRef.current = null;
      }, INITIAL_SYNC_TIMEOUT_MS);
    }
    return () => {
      active = false;
      throttledVehicleUpdate.cancel();
      unsub();
    };
  }, [isSessionReady, garage?.id, setVehicles]);

  // Subscribe to completed transactions
  useEffect(() => {
    if (!isSessionReady || !garage?.id) {
      return;
    }
    let active = true;
    const unsub = vehicleService.subscribeToTodayTransactions(garage.id, (completedTransactions, error) => {
      // Unsubscription cannot retract a callback that is already queued.
      if (!active) return;
      if (error) {
        showToast?.('تعذر تحديث سجل حركة اليوم. قد تكون البيانات المعروضة قديمة.', 'error');
        return;
      }
      setTodayTransactions(completedTransactions);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [isSessionReady, garage?.id, setTodayTransactions, showToast]);

  const staffLoadGenerationRef = useRef(0);
  const loadGarageData = useCallback(async (garageId: string) => {
    const requestGeneration = ++staffLoadGenerationRef.current;
    const ownerKey = dataOwnerKey;
    try {
      const staff = await adminService.getStaffByGarageOnce(garageId);
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
      const page = await garageService.getAdminGaragesPage(50, reset ? null : adminGarageCursorRef.current);
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
      const page = await delegateService.getAdminDelegatesPage(50, reset ? null : adminDelegateCursorRef.current);
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
  const retryDelegateDashboard = useCallback(() => {
    setDelegateDashboardRetryVersion((version) => version + 1);
  }, []);
  useEffect(() => {
    if (!isSessionReady || !isAuthReady || !delegateUserId || !delegateId || view !== 'delegate_dashboard') return;

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

    if (delegateDashboardLoadedOwnerRef.current !== delegateId) {
      setDelegateDashboardLoading(true);
      setDelegateDashboardError(false);
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
        const data = await delegateService.getDashboardData(delegateId);
        if (
          cancelled ||
          delegateDashboardGenerationRef.current !== requestGeneration ||
          delegateDashboardOwnerRef.current !== delegateId
        ) return;
        setDelegate(data.delegate);
        setDelegateDashboardLoading(false);
        setDelegateDashboardError(false);
        if (delegateDashboardLoadedOwnerRef.current !== delegateId) {
          delegateDashboardLoadedOwnerRef.current = delegateId;
          setAllGarages(data.garages as Garage[]);
          setDelegatePagination(data.pagination || {
            createdGarages: { hasMore: false, nextCursor: null },
            referredGarages: { hasMore: false, nextCursor: null },
          });
        } else {
          setAllGarages((previous) => Array.from(new Map([...previous, ...(data.garages as Garage[])].map((garage) => [garage.id, garage])).values()));
          // Polling refreshes the first-page snapshot, so its cursors must advance
          // with that snapshot rather than leaving pagination anchored to old data.
          if (data.pagination) setDelegatePagination(data.pagination);
        }
      } catch (err) {
        if (!cancelled && delegateDashboardGenerationRef.current === requestGeneration) {
          console.error('[useGarageSync] Failed to load delegate dashboard:', err);
          if (delegateDashboardLoadedOwnerRef.current !== delegateId) {
            setDelegateDashboardError(true);
          }
        }
      } finally {
        if (
          !cancelled &&
          delegateDashboardGenerationRef.current === requestGeneration &&
          delegateDashboardLoadedOwnerRef.current !== delegateId
        ) {
          setDelegateDashboardLoading(false);
        }
        dashboardRequestInFlight = false;
      }
    };

    void loadDashboard();
    // Delegates do not need second-by-second numbers. Every refresh reads the delegate
    // record plus a page of garages, so poll slowly and only while the tab is visible.
    const DASHBOARD_REFRESH_MS = 120_000;
    const DASHBOARD_MIN_GAP_MS = 30_000;
    let lastDashboardLoadAt = Date.now();
    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (Date.now() - lastDashboardLoadAt < DASHBOARD_MIN_GAP_MS) return;
      lastDashboardLoadAt = Date.now();
      void loadDashboard();
    };
    const refresh = window.setInterval(refreshIfVisible, DASHBOARD_REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      cancelled = true;
      if (delegateDashboardGenerationRef.current === requestGeneration) {
        delegateDashboardGenerationRef.current += 1;
      }
      window.clearInterval(refresh);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [isSessionReady, isAuthReady, delegateUserId, delegateId, view, delegateDashboardRetryVersion]);

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
      const nextPage = await delegateService.getDashboardDataPage(delegateId, section, page.nextCursor);
      if (
        requestGeneration !== delegateDashboardGenerationRef.current ||
        delegateDashboardOwnerRef.current !== delegateId
      ) return;
      setAllGarages((previous) => Array.from(new Map([...previous, ...nextPage.items].map((garage) => [garage.id, garage])).values()));
      setDelegatePagination((previous) => ({ ...previous, [section]: { hasMore: nextPage.hasMore, nextCursor: nextPage.nextCursor } }));
    } catch (error) {
      if (requestGeneration === delegateDashboardGenerationRef.current) {
        console.error(`[useGarageSync] Failed to load delegate ${section} page:`, error);
        setDelegateListsError(true);
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
    setDelegateListsError(false);
    await loadMoreDelegateSection('createdGarages', requestGeneration);
    await loadMoreDelegateSection('referredGarages', requestGeneration);
  }, [loadMoreDelegateSection]);

  // Packages listener removed — feature retired by owner.

  // Sync bounded admin collections. Detail pages retain their own selected-document reads.
  useEffect(() => {
    if (!isSessionReady || !isAuthReady || !user) return;

    if ((view === 'admin_dashboard' || view === 'admin_garage_details' || view === 'admin_delegate_details') && !adminListsLoadedRef.current) {
      void refreshAdminLists();
    }

    let garageSubscriptionCurrent = true;
    const subscribedGarageId = view === 'garage' ? garage?.id : undefined;
    const unsubCurrentGarage = subscribedGarageId
      ? garageService.subscribeToGarage(subscribedGarageId, (updatedGarage, metadata) => {
          // A callback already queued by the old listener must not replace the
          // active garage after a switch or logout.
          if (!garageSubscriptionCurrent || updatedGarage?.id !== subscribedGarageId) return;

          const fromCache = metadata?.fromCache ?? false;
          // Track first-fresh-snapshot delivery for the initial-sync gate.
          if (!fromCache && !garageFreshSnapshotReceivedRef.current) {
            garageFreshSnapshotReceivedRef.current = true;
            if (vehiclesFreshSnapshotReceivedRef.current) {
              setIsInitialSyncComplete(true);
              if (initialSyncTimeoutRef.current) {
                clearTimeout(initialSyncTimeoutRef.current);
                initialSyncTimeoutRef.current = null;
              }
            }
          }

          // Stale-snapshot guard. After a confirmed transaction, the Worker
          // response set `_confirmedTransactionUntil` on the garage state.
          // During that 2-second window, a stale Firestore snapshot can arrive
          // and overwrite the just-confirmed fields, causing the "flip then
          // revert then settle" flicker.
          //
          // CACHED-snapshot rule: if `fromCache === true`, the snapshot is
          // from the local cache and may be stale (queued before the user's
          // write committed, or cached from a prior session). In that case we
          // ALWAYS merge (preserve confirmed fields) regardless of the 2s
          // guard — cached snapshots are never authoritative.
          setGarage((current) => {
            if (!current) return updatedGarage;
            const guardUntil = (current as any)._confirmedTransactionUntil;
            const guardActive = guardUntil && Date.now() <= guardUntil;
            if (!guardActive && !fromCache) {
              return updatedGarage; // fresh snapshot, no active guard → full overwrite
            }
            // Either (a) guard active, or (b) cached snapshot — preserve
            // confirmed counters. For cached snapshots, also preserve the
            // daily-rolling stats (todayCount, todayRevenue, etc.) since those
            // are exactly the fields that visibly flicker when a stale cached
            // snapshot overwrites a just-confirmed transaction.
            const preserved: Partial<Garage> = {
              credits: current.credits,
              carsInside: current.carsInside,
            };
            if (fromCache) {
              (preserved as any).todayCount = current.todayCount;
              (preserved as any).todayRevenue = current.todayRevenue;
              (preserved as any).totalRevenue = current.totalRevenue;
              (preserved as any).totalVehiclesOut = current.totalVehiclesOut;
              (preserved as any).lastTransactionDate = current.lastTransactionDate;
              // Preserve the badge-trigger timestamp too — a stale cached
              // snapshot may carry an older lastCreditGrantAt (queued before
              // the fresh write committed). Letting it overwrite would
              // briefly suppress the "new credit grant" badge that the
              // fresh snapshot just turned on, causing a visible flicker.
              // See useCreditGrantNotification + audit Option 2 (2026-11-08).
              (preserved as any).lastCreditGrantAt = current.lastCreditGrantAt;
            }
            return {
              ...updatedGarage,
              ...preserved,
              _confirmedTransactionUntil: guardUntil, // keep the guard alive if it was active
            } as Garage;
          });
        })
      : () => {};

    const unsubCurrentDelegate = () => {};

    return () => {
      garageSubscriptionCurrent = false;
      unsubCurrentGarage();
      unsubCurrentDelegate();
    };
  }, [isSessionReady, isAuthReady, user, view, garage?.id, setGarage, refreshAdminLists]);

  // Load Admin specific garage details once
  useEffect(() => {
    if (!isSessionReady || !isAuthReady || !user || view !== 'admin_garage_details' || !selectedGarageForDetails?.id) return;

    const garageId = selectedGarageForDetails.id;
    // Never show the previous garage's staff while this selection is loading.
    setStaffList([]);
    let cancelled = false;
    const fetchSpecificData = async () => {
      try {
        const [staffData, garageData] = await Promise.all([
          adminService.getStaffByGarageOnce(garageId),
          garageService.getGarageById(garageId)
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
  }, [isSessionReady, isAuthReady, user, view, selectedGarageForDetails?.id, setSelectedGarageForDetails]);

  const delegateGarages = useMemo(() => {
    if (!delegate) return [];
    return allGarages.filter(g => g.createdByDelegateId === delegate.id || g.referrerId === delegate.id);
  }, [allGarages, delegate]);

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
    delegateListsError,
    delegateDashboardLoading,
    delegateDashboardError,
    retryDelegateDashboard,
    loadMoreDelegateGarages,
    loadGarageData,
    delegateGarages,
    isInitialSyncComplete,
  };
}
