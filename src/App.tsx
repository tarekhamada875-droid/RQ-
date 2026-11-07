/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, Suspense } from 'react';
import { useLocalStorageState } from './hooks/useLocalStorage';
import { useSystemConfig } from './hooks/useSystemConfig';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { LandscapeMobileView } from './components/layout/LandscapeMobileView';
import { OfflineView } from './components/layout/OfflineView';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import { logDiagnostic } from './utils/authDiagnosticLogger';
import { useGarageApp } from './hooks/useGarageApp';
import { useBackTrapping } from './hooks/useBackTrapping';
import { useBackHandler } from './hooks/backHandler';
import { VehicleOpsProvider } from './hooks/vehicleOpsContext';
import { SessionProvider } from './hooks/sessionContext';
import { NavigationUiProvider } from './hooks/navigationUiContext';
import { GarageDataProvider } from './hooks/garageDataContext';
import { AdminMutationsProvider } from './hooks/adminMutationsContext';
import { shouldWaitForSessionReady } from './utils/authViewGuard';
import { AppRoutes } from './components/app/AppRoutes';
import { AppOverlays } from './components/app/AppOverlays';

export default function App() {
  const app = useGarageApp();
  const { session, navigationUi, garageData, vehicleOperations, adminManagement } = app;
  const { isAuthReady, isSessionReady, isLoggingOut, currentStaff, showLogoutConfirm, setShowLogoutConfirm } = session;
  const { view, setView, showOfflineScreen, isLandscapeMobile, showSubscribers, setShowSubscribers, showDeleteConfirm, setShowDeleteConfirm, selectedGarageForDetails, selectedDelegateForDetails, setSelectedGarageForDetails, setSelectedDelegateForDetails } = navigationUi;
  const { garage, delegate } = garageData;
  const { isLoading, showCheckInModal, setShowCheckInModal, showCheckOutModal, setShowCheckOutModal, showRecentExitWarning, setShowRecentExitWarning, showSubscriberWarning, setShowSubscriberWarning, setSelectedVehicle, setRecentVehicle, setSubscriberWarningPlate } = vehicleOperations;

  const systemConfig = useSystemConfig();
  const [localAdminColor] = useLocalStorageState<string>('app_admin_color', '#10b981');
  const adminColor = systemConfig?.adminColor || localAdminColor || '#10b981';
  const activeColor = (view && (view.startsWith('admin_') || view === 'admin_dashboard')) ? adminColor : (garage?.shimmerColor || '#10b981');
  const resolvedColor = activeColor;

  useEffect(() => {
    if (!isLoading && isAuthReady) {
      if (view === 'garage' && !garage && !currentStaff && !localStorage.getItem('app_garage') && !localStorage.getItem('app_staff')) setView('login');
      else if (view === 'delegate_dashboard' && !delegate && !localStorage.getItem('app_delegate')) setView('login');
      else if (view === 'admin_garage_details' && !selectedGarageForDetails) setView('admin_dashboard');
      else if (view === 'admin_delegate_details' && !selectedDelegateForDetails) setView('admin_dashboard');
    }
  }, [isLoading, isAuthReady, view, garage, delegate, currentStaff, selectedGarageForDetails, selectedDelegateForDetails, setView]);

  // ── Back-handler registrations ──────────────────────────────────────
  // Each App-level modal registers itself via useBackHandler. When the phone
  // back button is pressed, the stack is popped top-to-bottom — the topmost
  // (most recently opened) modal closes first. No props, no refs, no drilling.
  useBackHandler(() => { setShowLogoutConfirm(false); return true; }, showLogoutConfirm);
  useBackHandler(() => { setShowCheckOutModal(false); return true; }, showCheckOutModal);
  useBackHandler(() => { setShowCheckInModal(false); setSelectedVehicle(null); return true; }, showCheckInModal);
  useBackHandler(() => { setShowDeleteConfirm(false); return true; }, showDeleteConfirm);
  useBackHandler(() => { setShowRecentExitWarning(false); setRecentVehicle(null); return true; }, showRecentExitWarning);
  useBackHandler(() => { setShowSubscriberWarning(false); setSubscriberWarningPlate(''); return true; }, showSubscriberWarning);
  useBackHandler(() => { setShowSubscribers(false); return true; }, showSubscribers);
  // Admin sub-pages: back returns to admin dashboard.
  useBackHandler(() => { setView('admin_dashboard'); setSelectedGarageForDetails(null); return true; }, view === 'admin_garage_details');
  useBackHandler(() => { setView('admin_dashboard'); setSelectedDelegateForDetails(null); return true; }, view === 'admin_delegate_details');

  useBackTrapping({
    view,
    setView,
    showLogoutConfirm,
    setShowLogoutConfirm,
    setSelectedGarageForDetails,
    setSelectedDelegateForDetails,
  });

  if (isLoggingOut) return <div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans" dir="rtl"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-slate-600 dark:text-slate-300 font-bold text-sm animate-pulse">جاري إنهاء الجلسة...</p></div>;
  if (isLandscapeMobile) return <LandscapeMobileView garage={view === 'garage' ? garage : null} />;
  if (showOfflineScreen) return <OfflineView />;
  // Initial-sync gate (fixes the reopen-refresh race): for the garage view
  // only, keep the loading screen up until both Firestore listeners have
  // delivered their first fresh (non-cached) snapshot, OR the 10s safety
  // timeout in useGarageSync fires. This prevents the user from starting a
  // check-in/out during the brief window where stale cached snapshots could
  // clobber optimistic UI writes. Admin/delegate views are not gated — they
  // use different listeners and were never affected by the race.
  const waitingForInitialSync = view === 'garage' && !garageData.isInitialSyncComplete;
  if (!isAuthReady || shouldWaitForSessionReady(view, isSessionReady) || waitingForInitialSync) {
    logDiagnostic(!isAuthReady ? 'APP_WAITING_FOR_AUTH_READY' : (waitingForInitialSync ? 'APP_WAITING_FOR_INITIAL_SYNC' : 'APP_WAITING_FOR_SESSION_READY'), { isAuthReady, isSessionReady, view, isInitialSyncComplete: garageData.isInitialSyncComplete });
    return <div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans" dir="rtl"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-slate-600 dark:text-slate-300 font-bold text-sm animate-pulse">جاري تحميل البيانات...</p></div>;
  }

  const isLoggedIn = Boolean(view && view !== 'login');
  return <div className={`w-full h-full bg-[#faf9f6] dark:bg-transparent transition-colors ${isLoggedIn ? 'theme-logged-in' : ''}`} style={{ '--theme-accent-color': resolvedColor } as React.CSSProperties}>
    <SessionProvider value={session}>
    <NavigationUiProvider value={navigationUi}>
    <GarageDataProvider value={garageData}>
    <AdminMutationsProvider value={adminManagement}>
    <VehicleOpsProvider value={vehicleOperations}>
    <ErrorBoundary>
      <NetworkStatusBanner />
      <AppOverlays />
      <Suspense fallback={<div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans" dir="rtl"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" /><p className="text-slate-600 dark:text-slate-300 font-bold text-xs animate-pulse">جاري تحميل الصفحة...</p></div>}>
        <AppRoutes />
      </Suspense>
    </ErrorBoundary>
    </VehicleOpsProvider>
    </AdminMutationsProvider>
    </GarageDataProvider>
    </NavigationUiProvider>
    </SessionProvider>
  </div>;
}
