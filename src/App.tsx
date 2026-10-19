/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, Suspense } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { resolveShimmerColor } from './utils';
import { useTheme } from './utils/ThemeContext';
import { useLocalStorageState } from './hooks/useLocalStorage';
import { useSystemConfig } from './hooks/useSystemConfig';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { LandscapeMobileView } from './components/layout/LandscapeMobileView';
import { OfflineView } from './components/layout/OfflineView';
import { NetworkStatusBanner } from './components/NetworkStatusBanner';
import { logDiagnostic } from './utils/authDiagnosticLogger';
import { useGarageApp } from './hooks/useGarageApp';
import { useBackTrapping } from './hooks/useBackTrapping';
import { shouldWaitForSessionReady } from './utils/authViewGuard';
import { AppRoutes } from './components/app/AppRoutes';
import { AppOverlays } from './components/app/AppOverlays';

export default function App() {
  const app = useGarageApp();
  const { session, navigationUi, vehicleOperations } = app;
  const { isAuthReady, isSessionReady, currentStaff, showLogoutConfirm, setShowLogoutConfirm } = session;
  const { view, setView, showOfflineScreen, isLandscapeMobile, toast, setToast, showPackages, setShowPackages, showStaffStats, setShowStaffStats, showSubscribers, setShowSubscribers, showDeleteConfirm, setShowDeleteConfirm, selectedGarageForDetails, selectedDelegateForDetails, setSelectedGarageForDetails, setSelectedDelegateForDetails } = navigationUi;
  const { garage, delegate } = app.garageData;
  const { isLoading, showCheckInModal, setShowCheckInModal, showCheckOutModal, setShowCheckOutModal, showRecentExitWarning, setShowRecentExitWarning, showSubscriberWarning, setShowSubscriberWarning, setSelectedVehicle, setRecentVehicle, setSubscriberWarningPlate } = vehicleOperations;

  const { theme } = useTheme();
  const systemConfig = useSystemConfig();
  const [localAdminColor] = useLocalStorageState<string>('app_admin_color', '#10b981');
  const adminColor = systemConfig?.adminColor || localAdminColor || '#10b981';
  const activeColor = (view && (view.startsWith('admin_') || view === 'admin_dashboard')) ? adminColor : (garage?.shimmerColor || '#10b981');
  const resolvedColor = resolveShimmerColor(activeColor, theme);

  useEffect(() => {
    if (!isLoading && isAuthReady) {
      if (view === 'garage' && !garage && !currentStaff && !localStorage.getItem('app_garage') && !localStorage.getItem('app_staff')) setView('login');
      else if (view === 'delegate_dashboard' && !delegate && !localStorage.getItem('app_delegate')) setView('login');
      else if (view === 'admin_garage_details' && !selectedGarageForDetails) setView('admin_dashboard');
      else if (view === 'admin_delegate_details' && !selectedDelegateForDetails) setView('admin_dashboard');
    }
  }, [isLoading, isAuthReady, view, garage, delegate, currentStaff, selectedGarageForDetails, selectedDelegateForDetails, setView]);

  useBackTrapping({
    view,
    setView,
    showCheckInModal,
    setShowCheckInModal,
    showCheckOutModal,
    setShowCheckOutModal,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showLogoutConfirm,
    setShowLogoutConfirm,
    showRecentExitWarning,
    setShowRecentExitWarning,
    showSubscriberWarning,
    setShowSubscriberWarning,
    showPackages,
    setShowPackages,
    showStaffStats,
    setShowStaffStats,
    showSubscribers,
    setShowSubscribers,
    setSelectedVehicle,
    setSelectedGarageForDetails,
    setSelectedDelegateForDetails,
    setRecentVehicle,
    setSubscriberWarningPlate,
  });

  if (isLandscapeMobile) return <LandscapeMobileView garage={view === 'garage' ? garage : null} />;
  if (showOfflineScreen) return <OfflineView />;
  if (!isAuthReady || shouldWaitForSessionReady(view, isSessionReady)) {
    logDiagnostic(!isAuthReady ? 'APP_WAITING_FOR_AUTH_READY' : 'APP_WAITING_FOR_SESSION_READY', { isAuthReady, isSessionReady, view });
    return <div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans" dir="rtl"><div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-slate-600 dark:text-slate-300 font-bold text-sm animate-pulse">جاري تحميل البيانات...</p></div>;
  }

  const isLoggedIn = Boolean(view && view !== 'login');
  return <div className={`w-full h-full bg-[#faf9f6] dark:bg-transparent transition-colors ${isLoggedIn ? 'theme-logged-in' : ''}`} style={{ '--theme-accent-color': resolvedColor } as React.CSSProperties}>
    <ErrorBoundary>
      <NetworkStatusBanner />
      {toast && <div className="fixed top-4 left-4 right-4 z-[300] flex justify-center pointer-events-none animate-slide-down"><div onClick={() => setToast(null)} role="alert" className="pointer-events-auto max-w-md w-full bg-slate-900/95 dark:bg-slate-900 text-white border border-slate-700/80 rounded-2xl p-3.5 px-4 shadow-xl flex items-start justify-between gap-3 backdrop-blur-md cursor-pointer transition-all active:scale-95"><div className="flex min-w-0 flex-1 items-start gap-3"><div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toast.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>{toast.type === 'error' ? <XCircle className="w-5 h-5 stroke-[2.5]" /> : <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />}</div><div className="min-w-0 flex-1 text-center" dir="rtl"><p className="text-xs sm:text-sm font-bold text-slate-100 leading-relaxed break-words whitespace-normal text-center">{toast.message}</p></div></div><button type="button" onClick={(event) => { event.stopPropagation(); setToast(null); }} className="text-slate-400 hover:text-white p-1 rounded-lg shrink-0 transition-colors" title="إغلاق"><X className="w-4 h-4" /></button></div></div>}
      <AppOverlays app={app} />
      <Suspense fallback={<div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans" dir="rtl"><div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" /><p className="text-slate-600 dark:text-slate-300 font-bold text-xs animate-pulse">جاري تحميل الصفحة...</p></div>}>
        <AppRoutes app={app} />
      </Suspense>
    </ErrorBoundary>
  </div>;
}
