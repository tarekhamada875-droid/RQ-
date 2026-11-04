import { createContext, useContext, type ReactNode } from 'react';
import type { useAdminAndGarageManagement } from './useAdminAndGarageManagement';

/**
 * Admin/garage-management mutations — login + create/delete operations
 * from useAdminAndGarageManagement.
 *
 * Previously drilled: useGarageApp.adminManagement → AppRoutes →
 * LoginView (handleGarageLogin) / AdminDashboard (createNewGarage) /
 * AdminDelegateDetailsView (removeDelegate) / DelegateDashboardView
 * (createNewGarage) through 3–4 layers.
 *
 * Now: App wraps the tree with AdminMutationsProvider; descendants call
 * useAdminMutations() to get what they need.
 */
type AdminMutations = ReturnType<typeof useAdminAndGarageManagement>;
export type { AdminMutations };

const AdminMutationsContext = createContext<AdminMutations | null>(null);

export function AdminMutationsProvider({
  value,
  children,
}: {
  value: AdminMutations;
  children: ReactNode;
}) {
  return (
    <AdminMutationsContext.Provider value={value}>
      {children}
    </AdminMutationsContext.Provider>
  );
}

export function useAdminMutations(): AdminMutations {
  const ctx = useContext(AdminMutationsContext);
  if (!ctx) throw new Error('useAdminMutations must be used within AdminMutationsProvider');
  return ctx;
}
