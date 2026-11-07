import { useEffect } from 'react';
import { LoginView } from '../auth/LoginView';
import { ErrorBoundary } from '../layout/ErrorBoundary';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { DelegateDashboardProvider } from '../../hooks/delegateDashboardContext';
import { useSession } from '../../hooks/sessionContext';
import { useNavigationUi } from '../../hooks/navigationUiContext';
import { useGarageData } from '../../hooks/garageDataContext';
import { useVehicleOps } from '../../hooks/vehicleOpsContext';
import { useAdminMutations } from '../../hooks/adminMutationsContext';
import { logDiagnostic } from '../../utils/authDiagnosticLogger';

const AdminDashboardLazy = lazyWithRetry(() => import('../admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const DelegateDashboardLazy = lazyWithRetry(() => import('../delegate/DelegateDashboardView').then(m => ({ default: m.DelegateDashboardView })));
const AdminGarageDetailsLazy = lazyWithRetry(() => import('../admin/AdminGarageDetailsView').then(m => ({ default: m.AdminGarageDetailsView })));
const AdminDelegateDetailsLazy = lazyWithRetry(() => import('../admin/AdminDelegateDetailsView').then(m => ({ default: m.AdminDelegateDetailsView })));
const GarageDashboardLazy = lazyWithRetry(() => import('../garage/GarageDashboardView').then(m => ({ default: m.GarageDashboardView })));

/**
 * Picks the top-level view based on the current `view` state. All shared
 * state is read via context hooks (useSession, useNavigationUi,
 * useGarageData, useVehicleOps, useAdminMutations) — no `app` prop.
 */
export function AppRoutes() {
  const { view, setView, selectedGarageForDetails, selectedDelegateForDetails, setSelectedGarageForDetails, setSelectedDelegateForDetails, loginPhone, setLoginPhone, showToast, closeKeyboard, showSubscribers, setShowSubscribers, setShowDeleteConfirm } = useNavigationUi();
  const { isAuthReady, currentStaff, handleInitiateLogout } = useSession();
  const { garage, delegate, delegates, allGarages, delegateGarages, staffList, setStaffList, delegatePagination, delegateListsLoading, delegateListsError, delegateDashboardLoading, delegateDashboardError, retryDelegateDashboard, loadMoreDelegateGarages, adminGarageHasMore, adminDelegateHasMore, adminListsLoading, adminListsError, loadMoreAdminGarages, loadMoreAdminDelegates, refreshAdminLists, vehicles, todayTransactions } = useGarageData();
  const { isLoading, setIsLoading } = useVehicleOps();
  const { handleGarageLogin, createNewGarage, removeDelegate } = useAdminMutations();

  // Audit D9 (Phase 7, 2026-11-06): moved logDiagnostic into useEffect so
  // it fires only when view/isAuthReady/isLoading actually change — not on
  // every re-render. Previously this was a bare function call in the render
  // body, which meant it ran on every single React re-render (dozens of times
  // per second during loading/typing), flooding the diagnostic log.
  useEffect(() => {
    logDiagnostic('RENDER_VIEW_EVALUATED', { view, isAuthReady, isLoading });
  }, [view, isAuthReady, isLoading]);

  useEffect(() => {
    if (!isLoading && isAuthReady) {
      if (view === 'garage' && !garage && !currentStaff) {
        const storedGarage = localStorage.getItem('app_garage');
        const storedStaff = localStorage.getItem('app_staff');
        if (!storedGarage && !storedStaff) setView('login');
      } else if (view === 'delegate_dashboard' && !delegate && !localStorage.getItem('app_delegate')) {
        setView('login');
      } else if (view === 'admin_garage_details' && !selectedGarageForDetails) {
        setView('admin_dashboard');
      } else if (view === 'admin_delegate_details' && !selectedDelegateForDetails) {
        setView('admin_dashboard');
      }
    }
  }, [view, garage, delegate, currentStaff, selectedGarageForDetails, selectedDelegateForDetails, isLoading, isAuthReady, setView]);

  if (view === 'login' || view === 'admin_login' || view === 'delegate_login') return <LoginView loginPhone={loginPhone} setLoginPhone={setLoginPhone} handleGarageLogin={handleGarageLogin} isLoading={isLoading || !isAuthReady} closeKeyboard={closeKeyboard} />;

  if (view === 'admin_dashboard') return <ErrorBoundary><AdminDashboardLazy allGarages={allGarages} isLoading={isLoading} createNewGarage={createNewGarage} setView={setView} setSelectedGarageForDetails={setSelectedGarageForDetails} setSelectedDelegateForDetails={setSelectedDelegateForDetails} delegates={delegates} adminGarageHasMore={adminGarageHasMore} adminDelegateHasMore={adminDelegateHasMore} adminListsLoading={adminListsLoading} adminListsError={adminListsError} onLoadMoreAdminGarages={loadMoreAdminGarages} onLoadMoreAdminDelegates={loadMoreAdminDelegates} onRefreshAdminLists={refreshAdminLists} showToast={showToast} /></ErrorBoundary>;

  if (view === 'delegate_dashboard' && delegate) return <ErrorBoundary><DelegateDashboardProvider value={{ delegatePagination, delegateListsLoading: !!delegateListsLoading, delegateListsError: !!delegateListsError, delegateDashboardLoading: !!delegateDashboardLoading, delegateDashboardError: !!delegateDashboardError, onRetryDelegateDashboard: retryDelegateDashboard, onLoadMoreDelegateGarages: loadMoreDelegateGarages }}><DelegateDashboardLazy delegate={delegate} allGarages={delegateGarages} onLogout={handleInitiateLogout} onCreateGarage={createNewGarage} isLoading={isLoading} /></DelegateDashboardProvider></ErrorBoundary>;

  if (view === 'admin_garage_details' && selectedGarageForDetails) return <ErrorBoundary><AdminGarageDetailsLazy selectedGarageForDetails={selectedGarageForDetails} setView={setView} setSelectedGarageForDetails={setSelectedGarageForDetails} setShowDeleteConfirm={setShowDeleteConfirm} staffList={staffList} setStaffList={setStaffList} isLoading={isLoading} setIsLoading={setIsLoading} onRefreshAdminLists={refreshAdminLists} /></ErrorBoundary>;

  if (view === 'admin_delegate_details' && selectedDelegateForDetails) {
    const liveDelegate = delegates.find(d => d.id === selectedDelegateForDetails.id) || selectedDelegateForDetails;
    return <ErrorBoundary><AdminDelegateDetailsLazy delegate={liveDelegate} setView={setView} setSelectedDelegate={setSelectedDelegateForDetails} removeDelegate={removeDelegate} /></ErrorBoundary>;
  }

  if (view === 'garage' && garage) return <ErrorBoundary><GarageDashboardLazy garage={garage} currentStaff={currentStaff} vehicles={vehicles} todayTransactions={todayTransactions} closeKeyboard={closeKeyboard} onLogout={handleInitiateLogout} showToast={showToast} staffList={staffList} showSubscribers={showSubscribers} setShowSubscribers={setShowSubscribers} /></ErrorBoundary>;

  return <LoginView loginPhone={loginPhone} setLoginPhone={setLoginPhone} handleGarageLogin={handleGarageLogin} isLoading={isLoading || !isAuthReady} closeKeyboard={closeKeyboard} />;
}
