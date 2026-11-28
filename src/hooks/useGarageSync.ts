import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { Garage, StaffMember } from '../types';
import { adminService, delegateService, garageService } from '../services';

interface UseGarageSyncProps {
  isSessionReady: boolean;
  isAuthReady: boolean;
  user: any;
  view: string;
  garage: Garage | null;
  setGarage: React.Dispatch<React.SetStateAction<Garage | null>>;
  delegate: any | null;
  setDelegate: (d: any | null) => void;
  selectedGarageForDetails: Garage | null;
  setSelectedGarageForDetails: (g: Garage | null) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  // PR-D piggyback: returns the latest entity-doc snapshot captured by
  // useGarageSession's session-guard onSnapshot, or null if no fresh snapshot
  // is available. Used to skip the duplicate delegate doc read on the Worker.
  getLatestEntitySnapshot?: () => { data: Record<string, unknown> | null; receivedAt: number } | null;
  // Audit F-4 (Phase 3b, 2026-11-26): for garage-owner sessions, the feed is
  // the single Firestore listener on garages/{id}. When it receives a fresh
  // (non-cached) snapshot where the doc no longer exists, it calls this
  // callback to trigger the same account-revoked toast + force-logout the
  // session guard used to perform on its own (now-removed) second onSnapshot.
  onAccountRevoked?: () => void;
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
  // setVehicles/setTodayTransactions removed (PR2, 2026-11-23): the always-on
  // active-vehicles stream was retired. The vehicles/todayTransactions state
  // no longer exists — the RegistrationCard looks up plates server-side
  // (1 read per typed plate) and the reports view manages its own listener.
  // showToast removed (2026-11-15): the only use was the today-transactions
  // listener's error toast, which was removed when the listener became
  // on-demand. The reports view handles its own error toasts now.
  getLatestEntitySnapshot,
  onAccountRevoked,
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
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
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

  // ── Initial sync gate (cache-first, perf audit 2026-11-28) ──────────
  // The dashboard renders as soon as the garage listener delivers its
  // FIRST snapshot — cached OR fresh. IndexedDB persistence is enabled
  // (firebase.ts persistentLocalCache), so a cached snapshot represents
  // valid data from the user's own previous session on this device.
  // The fresh snapshot upgrades state in the background.
  //
  // History: the gate originally waited for a FRESH (non-cached) snapshot
  // to prevent stale cached data from clobbering optimistic UI writes
  // during the brief window between app open and first server snapshot.
  // That race no longer exists:
  //  1. The active-vehicles listener (with optimistic-vehicle merging) was
  //     retired in PR2 (2026-11-23). The gate now waits on the garage
  //     listener alone.
  //  2. The _confirmedTransactionUntil merge rule (below, L564-610) now
  //     protects confirmed counters from stale-snapshot overwrites for 2s
  //     after every transaction. Cached snapshots always merge (never
  //     full-overwrite), preserving confirmed fields indefinitely.
  //
  // The 10-second timeout remains as the fallback for when no cache exists
  // and the network is slow — so a flaky network cannot permanently lock
  // the user out. Only the garage view is gated — admin/delegate views use
  // different listeners and are not affected.
  //
  // RESUME PERF (stale-tab reopen audit 2026-11-17): the garage-view
  // listener now attaches as soon as the identity is known (restored
  // localStorage garage + auth ready) instead of after the server session
  // claim. On the owner's 9h-idle reopen that moved first-snapshot
  // delivery INTO the claim's own latency window (token refresh + validate)
  // instead of after it, so the gate is bounded by the claim alone. The
  // Firestore rules for garages/{id} are satisfied by the same
  // server-written garage_sessions doc the claim refreshes — still active
  // on a reopen (24h timeout). If the claim ultimately fails
  // (occupied/kicked/expired), the same logout flow that always handled it
  // fires, and this listener is torn down by the identity change; a
  // permission-denied listener is console noise, never rendered content.
  const [isInitialSyncComplete, setIsInitialSyncComplete] = useState(false);
  const garageFirstSnapshotReceivedRef = useRef(false);
  const initialSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INITIAL_SYNC_TIMEOUT_MS = 10_000;

  // Audit F-4 (Phase 3b, 2026-11-26): re-entrance guard for account-revoked
  // eviction. Once the feed fires onAccountRevoked (fresh snapshot, doc gone),
  // subsequent snapshots must not re-trigger the toast/logout. Reset when the
  // subscription target changes (garageId/view) via the effect below.
  const accountRevokedRef = useRef(false);

  // Keep transient garage data tied to the active role/entity (identity),
  // not the shared garage ID and NOT the session-ready phase. The phase
  // prefix used to wipe same-identity data exactly when the claim completed,
  // which also destroyed snapshots that early-attached listeners delivered
  // while the claim was still in flight. Real ownership changes (view,
  // entity, user) still change the key and clear everything below.
  const isAdminView = view === 'admin_dashboard' || view.startsWith('admin_');
  const dataOwnerKey = (view === 'garage'
    ? `garage:${garage?.id ?? ''}:user:${user?.uid ?? ''}`
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

    setStaffList([]);
    staffLoadedForGarageRef.current = null; // AUDIT F-3: new owner → reports refetches its own roster
    staffLoadGenerationRef.current += 1; // discard any in-flight roster response
    staffLoadInFlightRef.current = null;
    staffInFlightGarageRef.current = null;
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
    // its own first-snapshot from its own listener before it can be
    // considered safe to interact with.
    garageFirstSnapshotReceivedRef.current = false;
    setIsInitialSyncComplete(false);
    if (initialSyncTimeoutRef.current) {
      clearTimeout(initialSyncTimeoutRef.current);
      initialSyncTimeoutRef.current = null;
    }
  }, [dataOwnerKey]);

  // Subscribe to active vehicles — REMOVED (PR2, 2026-11-23, owner decision).
  // The always-on stream read EVERY car inside at every login (~1 read per
  // car) plus a read per change, only to feed the retired cars-inside list
  // and the RegistrationCard inside-check — which now does a 1-read server
  // lookup per typed plate (vehicleService.getVehicleDocOnce). A garage with
  // 73 cars inside went from ~73 reads per login to 0; each checkout costs
  // exactly 1 lookup read instead.

  // Subscribe to completed transactions — REMOVED (2026-11-15, owner decision).
  // The always-on Firestore listener cost ~50 reads/garage/day for every
  // garage, even when nobody was looking at the reports page. The reports
  // view now manages its own on-demand listener (started when the user
  // clicks the "load data" button, stopped when they navigate away).
  // PR2 (2026-11-23): the now-consumerless todayTransactions global state was
  // removed entirely along with the vehicles state.

  const staffLoadGenerationRef = useRef(0);
  // AUDIT F-3 (2026-11-26): the staff roster is fetched LAZILY, on the first
  // reports-page open, instead of eagerly on every garage-session boot. The
  // only garage-flow consumer of staffList is the reports view (lazy, opened
  // on demand); at fleet scale the boot fetch burned roughly one read per
  // staff member per session for data the first screen never displays.
  // Single-flight + per-garage memo keeps repeat opens free, and the same
  // generation/owner guards discard in-flight responses on switch/logout.
  const staffLoadedForGarageRef = useRef<string | null>(null);
  const staffLoadInFlightRef = useRef<Promise<void> | null>(null);
  const staffInFlightGarageRef = useRef<string | null>(null);
  const ensureStaffLoaded = useCallback((garageId: string): Promise<void> => {
    if (staffLoadedForGarageRef.current === garageId) {
      return staffLoadInFlightRef.current ?? Promise.resolve();
    }
    // Single-flight PER GARAGE: an in-flight roster for a previous garage
    // must not swallow the new garage's request (garage switch while the
    // reports view is open). The generation guard discards the stale response.
    if (staffLoadInFlightRef.current && staffInFlightGarageRef.current === garageId) {
      return staffLoadInFlightRef.current;
    }
    const requestGeneration = ++staffLoadGenerationRef.current;
    const ownerKey = dataOwnerKey;
    const request = (async () => {
      try {
        const staff = await adminService.getStaffByGarageOnce(garageId);
        if (
          requestGeneration !== staffLoadGenerationRef.current ||
          previousDataOwnerKeyRef.current !== ownerKey
        ) return;
        setStaffList(staff);
        staffLoadedForGarageRef.current = garageId;
      } catch (err) {
        if (
          requestGeneration === staffLoadGenerationRef.current &&
          previousDataOwnerKeyRef.current === ownerKey
        ) {
          console.error('Failed to load garage staff:', err);
        }
      } finally {
        if (staffLoadInFlightRef.current === request) {
          staffLoadInFlightRef.current = null;
          staffInFlightGarageRef.current = null;
        }
      }
    })();
    staffLoadInFlightRef.current = request;
    staffInFlightGarageRef.current = garageId;
    return request;
  }, [dataOwnerKey, setStaffList]);

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
        // PR-D piggyback: if useGarageSession's session-guard onSnapshot has a
        // fresh delegate doc snapshot (≤10s old), pass includeDelegate=false so
        // the Worker skips the duplicate delegate doc read. We use the snapshot
        // for setDelegate() instead of the HTTP response's delegate field.
        const SNAPSHOT_FRESH_MS = 10_000;
        const latestSnapshot = getLatestEntitySnapshot?.();
        const snapshotIsFresh = Boolean(
          latestSnapshot
          && (Date.now() - latestSnapshot.receivedAt) < SNAPSHOT_FRESH_MS
          && latestSnapshot.data
        );
        // Only thread the options bag when piggybacking — keeps the no-piggyback
        // call signature identical to the pre-PR-D shape (`(delegateId)`) so
        // existing call-count and arg assertions stay valid.
        const data = snapshotIsFresh
          ? await delegateService.getDashboardData(delegateId, { includeDelegate: false })
          : await delegateService.getDashboardData(delegateId);
        if (
          cancelled ||
          delegateDashboardGenerationRef.current !== requestGeneration ||
          delegateDashboardOwnerRef.current !== delegateId
        ) return;
        // Use the cached snapshot for setDelegate when the Worker omitted it.
        // The snapshot data includes activeSessionIds (used by session-guard);
        // it is the canonical delegate doc state.
        const effectiveDelegate = data.delegate ?? (snapshotIsFresh && latestSnapshot?.data
          ? { id: delegateId, ...latestSnapshot.data }
          : null);
        if (effectiveDelegate) setDelegate(effectiveDelegate);
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
    // Delegates do not need second-by-second numbers. Every refresh reads a page
    // of garages (the delegate doc is now piggybacked on the session-guard
    // onSnapshot when fresh — see loadDashboard above), so poll slowly and only
    // while the tab is visible. Cadence extended from 120s → 180s in PR-D per
    // supervisor instruction "30s polls → piggyback or 90s" (no new listener).
    const DASHBOARD_REFRESH_MS = 180_000;
    const DASHBOARD_MIN_GAP_MS = 60_000;
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
      setAllGarages((previous) => Array.from(new Map([...previous, ...nextPage.garages].map((garage) => [garage.id, garage])).values()));
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
  // (Admin list loading stays gated on the server session claim — these are
  // Worker API calls that need the claimed session, unlike the garage-view
  // Firestore listeners below which only need a valid garage_sessions doc.)
  useEffect(() => {
    if (!isSessionReady || !isAuthReady || !user) return;

    if ((view === 'admin_dashboard' || view === 'admin_garage_details' || view === 'admin_delegate_details') && !adminListsLoadedRef.current) {
      void refreshAdminLists();
    }
  }, [isSessionReady, isAuthReady, user, view, refreshAdminLists]);

  // Current-garage document listener — early-attached (see the initial-sync
  // gate note above). Same callback contract as before; the only change is
  // that it no longer waits for the server session claim.
  useEffect(() => {
    if (!isAuthReady || view !== 'garage' || !garage?.id) {
      return;
    }

    // Audit F-4 (Phase 3b, 2026-11-26): reset the account-revoked guard for
    // each new subscription target. A fresh subscription to a different garage
    // (or the same garage after re-login) must be able to fire onAccountRevoked
    // again if that doc disappears.
    accountRevokedRef.current = false;

    let garageSubscriptionCurrent = true;
    const subscribedGarageId = garage?.id;
    const unsubCurrentGarage = subscribedGarageId
      ? garageService.subscribeToGarage(subscribedGarageId, (updatedGarage, metadata) => {
          // A callback already queued by the old listener must not replace the
          // active garage after a switch or logout.
          if (!garageSubscriptionCurrent || (updatedGarage && updatedGarage.id !== subscribedGarageId)) return;

          const fromCache = metadata?.fromCache ?? false;

          // Audit F-4 (Phase 3b, 2026-11-26): account-deletion detection.
          // The session guard used to detect this on a separate onSnapshot;
          // now the feed is the single listener for garage-owner sessions and
          // also handles this. Only act on FRESH (non-cached) non-existence —
          // cached non-existence can be stale (the doc exists on the server
          // but the local cache hasn't synced it). Mirrors the guard's original
          // fromCache rule. Once fired, the re-entrance guard prevents repeat
          // toasts/logout from subsequent snapshots during teardown.
          if (!updatedGarage) {
            if (!fromCache && !accountRevokedRef.current && onAccountRevoked) {
              accountRevokedRef.current = true;
              onAccountRevoked();
            }
            return;
          }

          // Cache-first gate (perf audit 2026-11-28): open the gate on the
          // FIRST snapshot — cached OR fresh. IndexedDB persistence is enabled,
          // so a cached snapshot is valid data from the user's own previous
          // session. The fresh snapshot upgrades state in the background. The
          // _confirmedTransactionUntil merge rule below protects confirmed
          // counters from stale-snapshot overwrites during transactions.
          if (!garageFirstSnapshotReceivedRef.current) {
            garageFirstSnapshotReceivedRef.current = true;
            setIsInitialSyncComplete(true);
            if (initialSyncTimeoutRef.current) {
              clearTimeout(initialSyncTimeoutRef.current);
              initialSyncTimeoutRef.current = null;
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

    // 10-second safety timeout: if Firestore cannot deliver a fresh snapshot
    // (e.g. flaky network at reopen), unlock the dashboard anyway so the user
    // is not permanently blocked from working. (Moved here from the retired
    // active-vehicles listener — PR2, 2026-11-23.)
    if (!initialSyncTimeoutRef.current) {
      initialSyncTimeoutRef.current = setTimeout(() => {
        setIsInitialSyncComplete(true);
        initialSyncTimeoutRef.current = null;
      }, INITIAL_SYNC_TIMEOUT_MS);
    }

    return () => {
      garageSubscriptionCurrent = false;
      unsubCurrentGarage();
    };
  }, [isAuthReady, view, garage?.id, setGarage, onAccountRevoked]);

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

  return useMemo(() => ({
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
    ensureStaffLoaded,
    delegateGarages,
    isInitialSyncComplete,
  // AUDIT F-1b (2026-11-26): the return object is memoized so the hook's host
  // (useGarageApp) can spread it into the memoized GarageDataProvider bucket
  // without busting that memo on every render. Before, every host render
  // produced a new return object → a new context value → unnecessary
  // re-renders of every context consumer.
  }), [allGarages, setAllGarages, delegates, setDelegates, adminGarageHasMore, adminDelegateHasMore,
    adminListsLoading, adminListsError, loadAdminGaragePage, loadAdminDelegatePage,
    refreshAdminLists, staffList, setStaffList, delegatePagination, delegateListsLoading,
    delegateListsError, delegateDashboardLoading, delegateDashboardError, retryDelegateDashboard,
    loadMoreDelegateGarages, ensureStaffLoaded, delegateGarages, isInitialSyncComplete]);
}
