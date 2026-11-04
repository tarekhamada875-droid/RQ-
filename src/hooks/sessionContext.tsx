import { createContext, useContext, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { Staff } from '../types';

/**
 * Session shared state — auth user, session id, logout flow.
 *
 * Previously drilled: useGarageSession → useGarageApp.session →
 * AppRoutes/AppOverlays → AdminDashboard → AdminHeader /
 * AdminNavigationAndViews (handleLogout, handleInitiateLogout,
 * showLogoutConfirm, currentStaff, sessionId through 3–4 layers).
 *
 * Now: App wraps the tree with SessionProvider; descendants call
 * useSession() to get what they need.
 */
export interface SessionContextValue {
  user: User | null;
  setUser: (u: User | null) => void;
  isAuthReady: boolean;
  sessionId: string;
  isSessionReady: boolean;
  currentStaff: Staff | null;
  setCurrentStaff: (s: Staff | null) => void;
  showLogoutConfirm: boolean;
  setShowLogoutConfirm: (show: boolean) => void;
  isLoggingOut: boolean;
  handleLogout: (isRemoteKicked?: boolean) => Promise<void>;
  handleInitiateLogout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionContextValue;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
