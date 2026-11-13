import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { logDiagnostic } from '../utils/authDiagnosticLogger';
import { doc, onSnapshot } from 'firebase/firestore';
import { Garage, Staff } from '../types';
import {
  getCanonicalSessionId,
  claimEntitySession,
  releaseEntitySession,
  refreshEntitySession,
  type EntityRole
} from '../services/authSessionService';
import { signInAnonymouslyOnce } from '../services/anonymousAuth';
import { listenerTracker } from '../utils/listenerTracker';

// A malformed persisted entity must not be mistaken for a session still hydrating.
const hasValidStoredEntity = (key: string): boolean => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      typeof (value as { id?: unknown }).id !== 'string' ||
      !(value as { id: string }).id.trim()
    ) {
      localStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage can be unavailable; fall through to the safe login path.
    }
    return false;
  }
};

interface UseGarageSessionProps {
  view: string;
  setView: (view: any) => void;
  garage: Garage | null;
  setGarage: (g: Garage | null) => void;
  delegate: any | null;
  setDelegate: (d: any | null) => void;
  currentStaff: Staff | null;
  setCurrentStaff: (s: Staff | null) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function useGarageSession({
  view,
  setView,
  garage,
  setGarage,
  delegate,
  setDelegate,
  currentStaff,
  setCurrentStaff,
  showToast,
}: UseGarageSessionProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [sessionId] = useState(() => getCanonicalSessionId());
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const logoutInProgressRef = useRef(false);

  // PR-D piggyback: latest entity-doc snapshot captured by the session-guard
  // onSnapshot below. Exposed via getLatestEntitySnapshot() so useGarageSync's
  // delegate dashboard poll can pass includeDelegate=false to the Worker and
  // skip the duplicate delegate doc read. NO new listener is created — this
  // ref is fed by the existing session-guard onSnapshot at L424.
  const latestEntitySnapshotRef = useRef<{ data: Record<string, unknown> | null; receivedAt: number } | null>(null);
  const getLatestEntitySnapshot = useCallback(() => latestEntitySnapshotRef.current, []);

  // Auth state listener
  useEffect(() => {
    logDiagnostic('AUTH_LISTENER_MOUNTED');
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      logDiagnostic('ON_AUTH_STATE_CHANGED', {
        userPresent: Boolean(u),
        uid: u?.uid || null,
        isAnonymous: u?.isAnonymous || false,
      });
      setUser(u);
      setIsAuthReady(true);
    });
    const timer = setTimeout(() => {
      logDiagnostic('AUTH_TIMEOUT_FALLBACK_TRIGGERED');
      setIsAuthReady(true);
    }, 4500);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // Track intentional manual logout vs remote kick
  const isDeliberateLogoutRef = useRef<boolean>(false);

  // Logout handler
  const handleLogout = useCallback(async (isRemoteKicked: boolean = false) => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    setIsLoggingOut(true);
    if (!isRemoteKicked) {
      isDeliberateLogoutRef.current = true;
    }

    // Capture active role & entity info before clearing local state
    let activeRole: EntityRole | null = null;
    let activeEntityId: string | null = null;
    const currentUser = auth.currentUser;

    if (view === 'garage') {
      if (currentStaff) {
        activeRole = 'staff';
        activeEntityId = currentStaff.id;
      } else if (garage) {
        activeRole = 'garage';
        activeEntityId = garage.id;
      }
    } else if (view === 'delegate_dashboard' && delegate) {
      activeRole = 'delegate';
      activeEntityId = delegate.id;
    } else if (view === 'admin_dashboard' || view.startsWith('admin_')) {
      activeRole = 'admin';
      activeEntityId = 'auth_pin';
    }

    // Storage may be disabled or quota/security-restricted. Never let it interrupt
    // clearing in-memory owner state or the authoritative session cleanup.
    try {
      Object.keys(localStorage).forEach(key => {
        const isAppKey = key.startsWith('app_') && key !== 'app_admin_color' && key !== 'app_theme' && key !== 'app_session_id';
        // STORAGE (DevTools runtime audit 2026-11-11, follow-up to the
        // successful-logout purge): attempt counters are scoped per
        // (identity, device session) as `logout_attempts:<identity>:session:<id>`.
        // A session that ends without the modal's success path — remote kick,
        // forced expiry, abandoned modal — leaves its counter behind, and
        // counters of identities that never log in again stay forever. A new
        // login starts a fresh attempt budget, so at session teardown every
        // logout_attempts:* key on this device is dead weight.
        const isLogoutAttemptKey = key.startsWith('logout_attempts:');
        if (isAppKey || isLogoutAttemptKey) {
          try { localStorage.removeItem(key); } catch { /* Continue clearing other keys. */ }
        }
      });
      for (const key of ['app_admin_pin', 'app_login_phone']) {
        try { localStorage.removeItem(key); } catch { /* Best-effort browser cleanup. */ }
      }
    } catch (storageError) {
      console.warn('تعذر مسح بعض بيانات الجلسة المحفوظة.', storageError);
    }

    setGarage(null);
    setDelegate(null);
    setCurrentStaff(null);
    setView('login');
    setShowLogoutConfirm(false);

    // Keep login UI blocked until release/sign-out finishes. Otherwise a fast
    // re-login can race the previous session's asynchronous cleanup.
    let releaseTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!isRemoteKicked && currentUser && activeRole && activeEntityId) {
        const release = releaseEntitySession({
          role: activeRole,
          entityId: activeEntityId,
          sessionId,
          uid: currentUser.uid
        });
        await Promise.race([
          release,
          new Promise<void>((_, reject) => {
            releaseTimeout = setTimeout(() => reject(new Error('SESSION_RELEASE_TIMEOUT')), 8000);
          })
        ]);
      }
    } catch (error) {
      console.warn('تعذر إكمال تحرير الجلسة قبل انتهاء المهلة.', error);
    } finally {
      if (releaseTimeout) clearTimeout(releaseTimeout);
      // Do not sign out a different Firebase identity if auth changed while
      // the previous session was being released.
      if (currentUser && auth.currentUser?.uid === currentUser.uid) {
        try {
          await signOut(auth);
        } catch (error) {
          console.warn('تعذر إنهاء جلسة Firebase.', error);
        }
      }
      logoutInProgressRef.current = false;
      setIsLoggingOut(false);
    }
  }, [view, currentStaff, garage, delegate, sessionId, setGarage, setDelegate, setCurrentStaff, setView]);

  const handleInitiateLogout = () => {
    setShowLogoutConfirm(true);
  };

  // Track last logout toast time to prevent multiple stacked toasts when session expires
  const lastLogoutToastRef = useRef<number>(0);

  const showLogoutToastOnce = useCallback((msg: string) => {
    if (isDeliberateLogoutRef.current) return;
    const now = Date.now();
    if (now - lastLogoutToastRef.current > 3000) {
      lastLogoutToastRef.current = now;
      showToast(msg, 'error');
    }
  }, [showToast]);

  // API Session Expiration Listener
  useEffect(() => {
    const handleApiSessionExpired = (e: any) => {
      if (isDeliberateLogoutRef.current) return;
      console.warn('[Session] Global api-session-expired event detected. Triggering forced logout:', e.detail);
      const detail = e.detail || {};
      const msg = detail.error || 'انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً';
      showLogoutToastOnce(msg);
      handleLogout(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('api-session-expired', handleApiSessionExpired);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('api-session-expired', handleApiSessionExpired);
      }
    };
  }, [handleLogout, showLogoutToastOnce]);

  // Authoritative Session & Coordinator
  useEffect(() => {
    if (view === 'login' || view === 'admin_login' || view === 'delegate_login') {
      setIsSessionReady(true);
      return;
    }

    setIsSessionReady(false);

    if (!isAuthReady) {
      return;
    }

    let isMounted = true;
    let unsubSnapshot: (() => void) | null = null;
    let heartbeatTimer: any = null;
    let visibilityHandler: (() => void) | null = null;

    const runCoordinator = async () => {
      isDeliberateLogoutRef.current = false;
      let currentUser = auth.currentUser;
      if (!currentUser) {
        try {
          currentUser = await signInAnonymouslyOnce();
          if (!isMounted) return;
          if (isMounted) setUser(currentUser);
        } catch (authErr: any) {
          if (!isMounted) return;
          console.error("Anonymous authentication failed:", authErr);
          const errMsg = authErr?.message || String(authErr);
          if (errMsg.includes('permission') || errMsg.includes('Permission')) {
            showLogoutToastOnce('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً');
            handleLogout(true);
            return;
          } else {
            showToast('تعذر تهيئة الجلسة. يرجى المحاولة مرة أخرى', 'error');
          }
          if (isMounted) setIsSessionReady(false);
          return;
        }
      }

      let activeRole: EntityRole | null = null;
      let activeEntityId: string | null = null;
      let docCollection: 'garages' | 'staff' | 'delegates' | 'admin_settings' | null = null;

      if (view === 'garage') {
        if (currentStaff) {
          activeRole = 'staff';
          activeEntityId = currentStaff.id;
          docCollection = 'staff';
        } else if (garage) {
          activeRole = 'garage';
          activeEntityId = garage.id;
          docCollection = 'garages';
        }
      } else if (view === 'delegate_dashboard' && delegate) {
        activeRole = 'delegate';
        activeEntityId = delegate.id;
        docCollection = 'delegates';
      } else if (view === 'admin_dashboard' || view.startsWith('admin_')) {
        activeRole = 'admin';
        activeEntityId = 'auth_pin';
        docCollection = 'admin_settings';
      }

      if (!activeRole || !activeEntityId) {
        // Only wait for a stored entity when it is a valid persisted record.
        // Malformed JSON or an object without an ID must not keep protected views
        // spinning forever while the session coordinator waits for hydration.
        const hasStoredGarage = hasValidStoredEntity('app_garage');
        const hasStoredStaff = hasValidStoredEntity('app_staff');
        const hasStoredDelegate = hasValidStoredEntity('app_delegate');
        if (
          (view === 'garage' && (hasStoredGarage || hasStoredStaff)) ||
          (view === 'delegate_dashboard' && hasStoredDelegate)
        ) {
          return;
        }

        if (isMounted) {
          setView('login');
          setIsSessionReady(true);
        }
        return;
      }

      const uid = currentUser.uid;

      try {
        await claimEntitySession({
          role: activeRole,
          entityId: activeEntityId,
          sessionId,
          uid
        });
        if (!isMounted) return;
        if (isMounted) setIsSessionReady(true);
      } catch (err: any) {
        if (!isMounted) return;
        console.warn('Session claim error in coordinator:', err);
        const errMsg = err?.message || String(err);
        if (
          errMsg === 'SESSION_OCCUPIED' ||
          errMsg === 'DELEGATE_SESSION_OCCUPIED' ||
          errMsg === 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS' ||
          errMsg.includes('مستخدم على جهاز آخر')
        ) {
          showToast('هذا الحساب نشط حالياً على جهاز آخر', 'error');
          handleLogout(true);
          return;
        } else if (errMsg.includes('permission') || errMsg.includes('Permission')) {
          showLogoutToastOnce('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً');
          handleLogout(true);
          return;
        } else {
          showToast('تعذر تهيئة الجلسة. يرجى تسجيل الدخول مرة أخرى', 'error');

          // The claim may have reached the server even if its response was lost.
          // Release only this exact role/entity/session, then return to login.
          await releaseEntitySession({
            role: activeRole,
            entityId: activeEntityId,
            sessionId,
            uid,
          }).catch((releaseErr) => {
            console.warn('Failed to release uncertain session claim:', releaseErr);
          });

          if (!isMounted) return;
          handleLogout(true);
          return;
        }
      }

      let lastHeartbeatTime = Date.now();
      const sendHeartbeat = async () => {
        if (!activeRole || !activeEntityId || !auth.currentUser) return;
        // Skip heartbeat when tab is inactive/minimized to save Firebase Spark write quota
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        try {
          const refreshResult = await refreshEntitySession({
            role: activeRole,
            entityId: activeEntityId,
            sessionId,
            uid: auth.currentUser.uid
          });
          if (!isMounted) return;
          if (refreshResult === false) {
            // The server explicitly confirmed revocation. Do not leave a
            // protected screen active until a later Firestore request fails.
            showLogoutToastOnce('تم تسجيل خروجك من جهاز آخر');
            handleLogout(true);
            return;
          }
          if (refreshResult === true) {
            lastHeartbeatTime = Date.now();
          }
        } catch (hbErr: any) {
          if (!isMounted) return;
          console.warn('Heartbeat refresh failed:', hbErr);
          const hbMsg = hbErr?.message || String(hbErr);
          if (
            hbMsg === 'SESSION_OCCUPIED' ||
            hbMsg === 'DELEGATE_SESSION_OCCUPIED' ||
            hbMsg === 'ACCESS_DENIED_ACTIVE_SESSION_EXISTS' ||
            hbMsg.includes('مستخدم على جهاز آخر')
          ) {
            showToast('هذا الحساب نشط حالياً على جهاز آخر', 'error');
            handleLogout(true);
          }
        }
      };

      // Each heartbeat costs Firestore writes on the Worker. The session timeout is
      // 24h, so a 60-minute interval (24 heartbeats/session) is more than enough to
      // keep it fresh. The Worker now only writes the session_index doc on heartbeat
      // (not the entity/root docs), so each heartbeat is 1 write instead of 3.
      const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;
      const HEARTBEAT_RESUME_GAP_MS = 30 * 60 * 1000;
      heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

      visibilityHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (Date.now() - lastHeartbeatTime > HEARTBEAT_RESUME_GAP_MS) {
            sendHeartbeat().catch(() => {});
          }
        }
      };

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', visibilityHandler);
      }

      if (docCollection && activeEntityId) {
        const entityDocRef = doc(db, docCollection, activeEntityId);
        let isEvicting = false;

        const unsubscribeEntitySnapshot = onSnapshot(entityDocRef, async (snapshot) => {
          if (!isMounted || isDeliberateLogoutRef.current || isEvicting) return;
          // Ignore offline cached snapshots - they can be stale and cause false evictions
          if (snapshot.metadata.fromCache) return;

          if (!snapshot.exists()) {
            isEvicting = true;
            showToast('عذراً، تم حذف أو تعطيل هذا الحساب من قبل مدير النظام.', 'error');
            handleLogout(true);
            return;
          }
          const data = snapshot.data();
          // PR-D piggyback: cache the fresh server snapshot so useGarageSync's
          // delegate dashboard poll can pass includeDelegate=false and skip the
          // duplicate delegate doc read on the Worker. Stored in a ref (not state)
          // to avoid extra re-renders — the dashboard poll reads it synchronously.
          latestEntitySnapshotRef.current = { data: data || null, receivedAt: Date.now() };
          // Session revocation is deliberately NOT detected here. The entity
          // doc's activeSessionIds array is advisory bookkeeping with several
          // non-transactional writers on the Worker; treating a missing marker
          // as eviction force-logged-out live devices whose session doc was
          // still active (the 2026-11-13 "logged out from another device"
          // incident). The authoritative revocation record is the device
          // session doc, which the browser cannot read directly; it reaches
          // this client through (a) any Worker API call answering 401 (the
          // global api-session-expired event), and (b) the hourly
          // validate-or-refresh heartbeat. Both paths already force logout.
        }, (err) => {
          console.warn('Entity lock snapshot warning:', err);
        });
        const unregisterSessionSnapshot = listenerTracker.register(`session_guard/${docCollection}/${activeEntityId}`);
        unsubSnapshot = () => {
          try {
            unsubscribeEntitySnapshot();
          } finally {
            unregisterSessionSnapshot();
          }
        };
      }
    };

    runCoordinator();

    return () => {
      isMounted = false;
      if (unsubSnapshot) unsubSnapshot();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (typeof document !== 'undefined' && visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
    };
  }, [view, isAuthReady, sessionId, garage?.id, delegate?.id, currentStaff?.id]);

  // PR-H: memoize the session context bucket. Without useMemo, this
  // return creates a new object on every render, causing ALL useSession()
  // consumers to re-render — even when only one value (e.g. showLogoutConfirm)
  // changed. The deps array lists every value that goes into the object.
  return useMemo(() => ({
    user,
    setUser,
    isAuthReady,
    sessionId,
    isSessionReady,
    showLogoutConfirm,
    setShowLogoutConfirm,
    isLoggingOut,
    handleLogout,
    handleInitiateLogout,
    getLatestEntitySnapshot,
  }), [
    user,
    setUser,
    isAuthReady,
    sessionId,
    isSessionReady,
    showLogoutConfirm,
    setShowLogoutConfirm,
    isLoggingOut,
    handleLogout,
    handleInitiateLogout,
    getLatestEntitySnapshot,
  ]);
}
