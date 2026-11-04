import { createContext, useContext, type ReactNode } from 'react';
import type { Garage, Delegate } from '../types';

/**
 * Admin panel shared state — list pagination + navigation.
 *
 * Previously drilled: useGarageSync → useGarageApp → AppRoutes →
 * AdminDashboard → AdminNavigationAndViews (7 pagination props + 2
 * navigation props through 4 layers).
 *
 * Now: AdminDashboard wraps its children with AdminProvider, and
 * AdminNavigationAndViews calls useAdmin() to get what it needs.
 */

interface AdminContextValue {
  // List pagination
  adminGarageHasMore: boolean;
  adminDelegateHasMore: boolean;
  adminListsLoading: boolean;
  adminListsError: boolean;
  onLoadMoreAdminGarages: () => Promise<void>;
  onLoadMoreAdminDelegates: () => Promise<void>;
  onRefreshAdminLists: () => Promise<void>;
  // Navigation
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  setSelectedDelegateForDetails: (delegate: Delegate | null) => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ value, children }: { value: AdminContextValue; children: ReactNode }) {
  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
