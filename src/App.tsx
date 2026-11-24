/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, Suspense } from 'react';
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
import { DelayedFallback } from './components/layout/LoadingFallbacks';
import { DestinationScreen, SuspenseRoleSkeleton } from './components/layout/RoleSkeletons';
import { AppRoutes } from './components/app/AppRoutes';
import { AppOverlays } from './components/app/AppOverlays';
import { useTheme } from './utils/ThemeContext';

export default function App() {
  const app = useGarageApp();
  const { session, navigationUi, garageData, vehicleOperations, adminManagement } = app;
  const { isAuthReady, isSessionReady, isLoggingOut, currentStaff, showLogoutConfirm, setShowLogoutConfirm } = session;
  const { view, setView, showOfflineScreen, isLandscapeMobile, showSubscribers, setShowSubscribers, showDeleteConfirm, setShowDeleteConfirm, selectedGarageForDetails, selectedDelegateForDetails, setSelectedGarageForDetails, setSelectedDelegateForDetails } = navigationUi;
  const { garage, delegate } = garageData;
  const { isLoading, showCheckInModal, setShowCheckInModal, showCheckOutModal, setShowCheckOutModal, showSubscriberWarning, setShowSubscriberWarning, setSelectedVehicle, setSubscriberWarningPlate } = vehicleOperations;

  // Force light theme when the garage view is active — garage owners always
  // see the light/day theme for maximum clarity, regardless of their phone's
  // dark mode setting. Admin and delegate views keep their normal theme.
  const { forceLight } = useTheme();
  useEffect(() => {
    forceLight(view === 'garage');
  }, [view, forceLight]);

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

  // UX-C soft loading: the FIRST gate of a page load renders immediately so
  // the handoff from main.tsx's BootSplash stays seamless. Any gate that
  // appears AFTER real content was on screen (view switches, session
  // re-claims) waits 250ms first — fast transitions then swap content with
  // no loading flash at all, slow ones still get the full sync screen.
  const waitingForInitialSyncEarly = view === 'garage' && !garageData.isInitialSyncComplete;
  const isGateActive = !isAuthReady || shouldWaitForSessionReady(view, isSessionReady) || waitingForInitialSyncEarly;
  const hasRenderedContentRef = useRef(false);
  useEffect(() => {
    if (!isGateActive) hasRenderedContentRef.current = true;
  }, [isGateActive]);

  // ── Back-handler registrations ──────────────────────────────────────
  // Each App-level modal registers itself via useBackHandler. When the phone
  // back button is pressed, the stack is popped top-to-bottom — the topmost
  // (most recently opened) modal closes first. No props, no refs, no drilling.
  useBackHandler(() => { setShowLogoutConfirm(false); return true; }, showLogoutConfirm);
  useBackHandler(() => { setShowCheckOutModal(false); return true; }, showCheckOutModal);
  useBackHandler(() => { setShowCheckInModal(false); setSelectedVehicle(null); return true; }, showCheckInModal);
  useBackHandler(() => { setShowDeleteConfirm(false); return true; }, showDeleteConfirm);
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

  if (isLoggingOut) return <div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans" dir="rtl"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-slate-600 dark:text-slate-300 font-bold text-sm">جاري الخروج...</p></div>;
  if (isLandscapeMobile) return <LandscapeMobileView garage={view === 'garage' ? garage : null} />;
  if (showOfflineScreen) return <OfflineView />;
  // Initial-sync gate (fixes the reopen-refresh race): for the garage view
  // only, keep the loading screen up until Firestore has delivered its
  // FIRST snapshot (cached OR fresh — see useGarageSync 2026-11-23), OR
  // the 10s safety timeout fires. This prevents the user from starting
  // a check-in/out during the brief window where stale cached snapshots
  // could clobber optimistic UI writes. Admin/delegate views are not
  // gated — they use different listeners and were never affected by the
  // race.
  //
  // LOADING-UX (2026-11-25, owner initiative "A+B+C") — the gate now shows
  // the DESTINATION screen, resolved from the persisted view + stored
  // identities (resolveBootShape, zero network involved):
  //   (A) headed to a login view → the REAL login screen. It is fully
  //       static (plate + keypad need no data), so a cold start shows the
  //       actual screen immediately instead of a fake preview of it.
  //   (B) headed to a dashboard → a skeleton mirroring THAT dashboard's
  //       real layout (garage / admin / delegate), so slow loads read as
  //       "the screen filling in" instead of a generic broken-looking ghost.
  //   (C) the very first gate still renders IMMEDIATELY so the handoff from
  //       main.tsx's BootSplash stays seamless (BootSplash shows the same
  //       brand family); re-gates after real content keep the 250ms
  //       no-flash delay. Fast re-gates (<250ms) show nothing at all.
  //   The old generic PageSkeleton (spinner pill + "جاري التحميل..." +
  //   unrelated gray blocks) is gone from this path — it matched no real
  //   screen (owner screenshot 2026-11-24).
  if (isGateActive) {
    logDiagnostic(!isAuthReady ? 'APP_WAITING_FOR_AUTH_READY' : (waitingForInitialSyncEarly ? 'APP_WAITING_FOR_INITIAL_SYNC' : 'APP_WAITING_FOR_SESSION_READY'), { isAuthReady, isSessionReady, view, isInitialSyncComplete: garageData.isInitialSyncComplete });
    const gateScreen = (
      <DestinationScreen
        view={view}
        loginProps={{
          loginPhone: navigationUi.loginPhone,
          setLoginPhone: navigationUi.setLoginPhone,
          handleGarageLogin: adminManagement.handleGarageLogin,
          isLoading: isLoading || !isAuthReady,
          closeKeyboard: navigationUi.closeKeyboard,
        }}
      />
    );
    return hasRenderedContentRef.current ? <DelayedFallback>{gateScreen}</DelayedFallback> : gateScreen;
  }

  const isLoggedIn = Boolean(view && view !== 'login');
  return <div className={`w-full h-full bg-[#faf9f6] dark:bg-transparent ${isLoggedIn ? 'theme-logged-in' : ''}`} style={{ '--theme-accent-color': resolvedColor } as React.CSSProperties}>
    <SessionProvider value={session}>
    <NavigationUiProvider value={navigationUi}>
    <GarageDataProvider value={garageData}>
    <AdminMutationsProvider value={adminManagement}>
    <VehicleOpsProvider value={vehicleOperations}>
    <ErrorBoundary>
      <NetworkStatusBanner />
      <AppOverlays />
      <Suspense fallback={<DelayedFallback><SuspenseRoleSkeleton /></DelayedFallback>}>
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
