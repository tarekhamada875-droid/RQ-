import { createContext, useContext, type ReactNode } from 'react';
import type { Garage, Delegate, Vehicle, Staff } from '../types';
import type { useGarageSync } from './useGarageSync';
import type { useLocalStorageState } from './useLocalStorage';

/**
 * Garage data shared state — sync data from useGarageSync (lists, vehicles,
 * staff, pagination cursors) plus the local-state garage/delegate/vehicles
 * owners that are mutated by the sync hook.
 *
 * Previously drilled: useGarageApp.garageData → AppRoutes → AdminDashboard /
 * AdminGarageDetailsView / AdminDelegateDetailsView / GarageDashboardView /
 * DelegateDashboardView (garage, delegate, vehicles, todayTransactions,
 * allGarages, delegates, staffList, pagination through 3–4 layers).
 *
 * Now: App wraps the tree with GarageDataProvider; descendants call
 * useGarageData() to get what they need.
 */
export type GarageDataSync = ReturnType<typeof useGarageSync>;

export interface GarageDataContextValue extends GarageDataSync {
  garage: Garage | null;
  setGarage: ReturnType<typeof useLocalStorageState<Garage | null>>[1];
  delegate: Delegate | null;
  setDelegate: ReturnType<typeof useLocalStorageState<Delegate | null>>[1];
  vehicles: Vehicle[];
  todayTransactions: Vehicle[];
}

const GarageDataContext = createContext<GarageDataContextValue | null>(null);

export function GarageDataProvider({
  value,
  children,
}: {
  value: GarageDataContextValue;
  children: ReactNode;
}) {
  return (
    <GarageDataContext.Provider value={value}>
      {children}
    </GarageDataContext.Provider>
  );
}

export function useGarageData(): GarageDataContextValue {
  const ctx = useContext(GarageDataContext);
  if (!ctx) throw new Error('useGarageData must be used within GarageDataProvider');
  return ctx;
}

// Re-export for downstream consumers that need the staff type.
export type { Staff };
