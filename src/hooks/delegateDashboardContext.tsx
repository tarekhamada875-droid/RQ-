import { createContext, useContext, type ReactNode } from 'react';

/**
 * Delegate dashboard shared state — pagination + loading/error.
 *
 * Previously drilled: useGarageSync → useGarageApp → AppRoutes →
 * DelegateDashboardView (7 props through 3 layers).
 *
 * Now: AppRoutes wraps DelegateDashboardView with DelegateDashboardProvider,
 * and the view calls useDelegateDashboard() to get what it needs.
 */

interface DelegateDashboardContextValue {
  delegatePagination: Record<'createdGarages' | 'referredGarages', { hasMore: boolean; nextCursor: string | null }> | undefined;
  delegateListsLoading: boolean;
  delegateListsError: boolean;
  delegateDashboardLoading: boolean;
  delegateDashboardError: boolean;
  onRetryDelegateDashboard: (() => void) | undefined;
  onLoadMoreDelegateGarages: (() => void) | undefined;
}

const DelegateDashboardContext = createContext<DelegateDashboardContextValue | null>(null);

export function DelegateDashboardProvider({ value, children }: { value: DelegateDashboardContextValue; children: ReactNode }) {
  return (
    <DelegateDashboardContext.Provider value={value}>
      {children}
    </DelegateDashboardContext.Provider>
  );
}

export function useDelegateDashboard(): DelegateDashboardContextValue {
  const ctx = useContext(DelegateDashboardContext);
  if (!ctx) throw new Error('useDelegateDashboard must be used within DelegateDashboardProvider');
  return ctx;
}
