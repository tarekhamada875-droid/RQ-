import { createContext, useContext, type ReactNode } from 'react';
import type { Garage, Delegate } from '../types';
import type { GarageDeletionProgress } from '../services/garageDeletionService';
import type { useGarageInput } from './garageInput';

/**
 * Navigation/UI shared state — view, selection, dialogs, toast, keyboard, online.
 *
 * Previously drilled: useGarageApp.navigationUi → AppRoutes → LoginView /
 * AdminDashboard / AdminGarageDetailsView / AdminDelegateDetailsView /
 * GarageDashboardView (view, setView, selectedGarageForDetails,
 * selectedDelegateForDetails, showSubscribers, showDeleteConfirm,
 * garageDeletionProgress, showToast, closeKeyboard, isOnline,
 * showOfflineScreen through 3–4 layers).
 *
 * Now: App wraps the tree with NavigationUiProvider; descendants call
 * useNavigationUi() to get what they need.
 */
export interface NavigationUiContextValue {
  isLandscapeMobile: boolean;
  view: string;
  setView: (view: any) => void;
  loginPhone: string;
  setLoginPhone: (phone: string) => void;
  selectedGarageForDetails: Garage | null;
  setSelectedGarageForDetails: (g: Garage | null) => void;
  selectedDelegateForDetails: Delegate | null;
  setSelectedDelegateForDetails: (d: Delegate | null) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (show: boolean) => void;
  garageDeletionProgress: GarageDeletionProgress | null;
  showSubscribers: boolean;
  setShowSubscribers: (show: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  closeKeyboard: ReturnType<typeof useGarageInput>['closeKeyboard'];
  isOnline: boolean;
  showOfflineScreen: boolean;
}

const NavigationUiContext = createContext<NavigationUiContextValue | null>(null);

export function NavigationUiProvider({
  value,
  children,
}: {
  value: NavigationUiContextValue;
  children: ReactNode;
}) {
  return (
    <NavigationUiContext.Provider value={value}>
      {children}
    </NavigationUiContext.Provider>
  );
}

export function useNavigationUi(): NavigationUiContextValue {
  const ctx = useContext(NavigationUiContext);
  if (!ctx) throw new Error('useNavigationUi must be used within NavigationUiProvider');
  return ctx;
}
