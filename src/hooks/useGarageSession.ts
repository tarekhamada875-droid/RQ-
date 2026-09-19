import { useState, useEffect, useRef } from 'react';
import { User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth, db } from '../firebase';
import { logDiagnostic } from '../utils/authDiagnosticLogger';
import { doc, onSnapshot } from 'firebase/firestore';
import { Garage, Staff, Supervisor } from '../types';
import { 
  getCanonicalSessionId, 
  claimEntitySession, 
  releaseEntitySession, 
  refreshEntitySession, 
  type EntityRole 
} from '../services/authSessionService';
import { signOut } from 'firebase/auth';

interface UseGarageSessionProps {
  view: string;
  setView: (view: any) => void;
  garage: Garage | null;
  setGarage: (g: Garage | null) => void;
  delegate: any | null;
  setDelegate: (d: any | null) => void;
  currentStaff: Staff | null;
  setCurrentStaff: (s: Staff | null) => void;
  currentSupervisor: Supervisor | null;
  setCurrentSupervisor: (s: Supervisor | null) => void;
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
  currentSupervisor,
  setCurrentSupervisor,
  showToast,
}: UseGarageSessionProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [sessionId] = useState(() => getCanonicalSessionId());
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  // Logout handler
  const handleLogout = async (isRemoteKicked: boolean = false) => {
    try {
      if (!isRemoteKicked && auth.currentUser) {
        let activeRole: EntityRole | null = null;
        let activeEntityId: string | null = null;

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
          if (currentSupervisor) {
            activeRole = 'supervisor';
            activeEntityId = currentSupervisor.id;
          } else {
            activeRole = 'admin';
            activeEntityId = 'auth_pin';
          }
        }

        if (activeRole && activeEntityId) {
          await releaseEntitySession({
            role: activeRole,
            entityId: activeEntityId,
            sessionId,
            uid: auth.currentUser.uid
          }).catch(err => console.warn('Release entity session failed:', err));
        }
      }

      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
      showToast('حدث خطأ، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('app_') && key !== 'app_admin_color' && key !== 'app_theme' && key !== 'app_session_id') {
          localStorage.removeItem(key);
        }
      });
      localStorage.removeItem('app_admin_pin');
      localStorage.removeItem('app_login_phone');
      setGarage(null);
      setDelegate(null);
      setCurrentStaff(null);
      setCurrentSupervisor(null);
      setView('login');
      setShowLogoutConfirm(false);
    }
  };

  const handleInitiateLogout = () => {
    setShowLogoutConfirm(true);
  };

  // Track last logout toast time to prevent multiple stacked toasts when session expires
  const lastLogoutToastRef = useRef<number>(0);

  const showLogoutToastOnce = (msg: string) => {
    const now = Date.now();
    if (now - lastLogoutToastRef.current > 3000) {
      lastLogoutToastRef.current = now;
      showToast(msg, 'error');
    }
  };

  // API Session Expiration Listener
  useEffect(() => {
    const handleApiSessionExpired = (e: any) => {
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
  }, [showToast]);

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
      let currentUser = auth.currentUser;
      if (!currentUser) {
        try {
          const userCred = await signInAnonymously(auth);
          currentUser = userCred.user;
          if (isMounted) setUser(currentUser);
        } catch (authErr: any) {
          console.error("Anonymous authentication failed:", authErr);
          const errMsg = authErr?.message || String(authErr);
          if (errMsg.includes('permission') || errMsg.includes('Permission')) {
            showLogoutToastOnce('انتهت الجلسة لعدم النشاط، يرجى تسجيل الدخول مجدداً');
            handleLogout(true);
            return;
          } else {
            showToast('جاري تحديث الاتصال، يرجى المحاولة مرة أخرى', 'error');
          }
          if (isMounted) setIsSessionReady(false);
          return;
        }
      }

      let activeRole: EntityRole | null = null;
      let activeEntityId: string | null = null;
      let docCollection: 'garages' | 'staff' | 'delegates' | 'supervisors' | 'admin_settings' | null = null;

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
        if (currentSupervisor) {
          activeRole = 'supervisor';
          activeEntityId = currentSupervisor.id;
          docCollection = 'supervisors';
        } else {
          activeRole = 'admin';
          activeEntityId = 'auth_pin';
          docCollection = 'admin_settings';
        }
      }

      if (!activeRole || !activeEntityId) {
        // Prevent kicking to login if localStorage data is still hydrating
        try {
          const storedGarage = localStorage.getItem('app_garage');
          const storedDelegate = localStorage.getItem('app_delegate');
          const storedStaff = localStorage.getItem('app_staff');
          const storedSupervisor = localStorage.getItem('app_supervisor');
          if (
            (view === 'garage' && (storedGarage || storedStaff)) ||
            (view === 'delegate_dashboard' && storedDelegate) ||
            (view.startsWith('admin_') && storedSupervisor)
          ) {
            return;
          }
        } catch {
          // Invalid or unavailable storage should fall through to the login state.
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
        if (isMounted) setIsSessionReady(true);
      } catch (err: any) {
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
          showToast('جاري تحديث الاتصال، يرجى المحاولة مرة أخرى', 'error');
          if (isMounted) setIsSessionReady(true);
          return;
        }
      }

      let lastHeartbeatTime = Date.now();
      const sendHeartbeat = async () => {
        if (!activeRole || !activeEntityId || !auth.currentUser) return;
        // Skip heartbeat when tab is inactive/minimized to save Firebase Spark write quota
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        try {
          await refreshEntitySession({
            role: activeRole,
            entityId: activeEntityId,
            sessionId,
            uid: auth.currentUser.uid
          });
          lastHeartbeatTime = Date.now();
        } catch (hbErr: any) {
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

      // 5-minute heartbeat interval is fully safe with 15-minute session timeout and significantly reduces Firebase Spark write quota
      heartbeatTimer = setInterval(sendHeartbeat, 300000);

      visibilityHandler = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          if (Date.now() - lastHeartbeatTime > 180000) {
            sendHeartbeat().catch(() => {});
          }
        }
      };

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', visibilityHandler);
      }

      if (docCollection && activeEntityId) {
        const entityDocRef = doc(db, docCollection, activeEntityId);
        unsubSnapshot = onSnapshot(entityDocRef, (snapshot) => {
          if (!snapshot.exists()) {
            showToast('عذراً، تم حذف أو تعطيل هذا الحساب من قبل مدير النظام.', 'error');
            handleLogout(true);
            return;
          }
          const data = snapshot.data();
          if (data?.currentSessionId && data.currentSessionId !== sessionId) {
            showLogoutToastOnce('تم تسجيل خروجك من جهاز آخر');
            handleLogout(true);
          }
        }, (err) => {
          console.warn('Entity lock snapshot warning:', err);
        });
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
  }, [view, isAuthReady, sessionId, garage?.id, delegate?.id, currentStaff?.id, currentSupervisor?.id]);

  return {
    user,
    setUser,
    isAuthReady,
    sessionId,
    isSessionReady,
    showLogoutConfirm,
    setShowLogoutConfirm,
    handleLogout,
    handleInitiateLogout,
  };
}
