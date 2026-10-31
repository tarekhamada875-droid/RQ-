import { useEffect } from 'react';
import { LoginView } from '../auth/LoginView';
import { ErrorBoundary } from '../layout/ErrorBoundary';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import type { GarageAppState } from '../../hooks/useGarageApp';
import { logDiagnostic } from '../../utils/authDiagnosticLogger';

const AdminDashboardLazy = lazyWithRetry(() => import('../admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const DelegateDashboardLazy = lazyWithRetry(() => import('../delegate/DelegateDashboardView').then(m => ({ default: m.DelegateDashboardView })));
const AdminGarageDetailsLazy = lazyWithRetry(() => import('../admin/AdminGarageDetailsView').then(m => ({ default: m.AdminGarageDetailsView })));
const AdminDelegateDetailsLazy = lazyWithRetry(() => import('../admin/AdminDelegateDetailsView').then(m => ({ default: m.AdminDelegateDetailsView })));
const GarageDashboardLazy = lazyWithRetry(() => import('../garage/GarageDashboardView').then(m => ({ default: m.GarageDashboardView })));

interface AppRoutesProps {
  app: GarageAppState;
}

export function AppRoutes({ app }: AppRoutesProps) {
  const { session, navigationUi, garageData, vehicleOperations, adminManagement } = app;
  const { view, setView, selectedGarageForDetails, selectedDelegateForDetails } = navigationUi;
  const { isAuthReady, currentStaff, handleInitiateLogout } = session;
  const { garage, delegate, delegates, allGarages, delegateGarages, staffList, setStaffList, delegatePagination, delegateListsLoading, delegateListsError, delegateDashboardLoading, delegateDashboardError, retryDelegateDashboard, loadMoreDelegateGarages, adminGarageHasMore, adminDelegateHasMore, adminListsLoading, adminListsError, loadMoreAdminGarages, loadMoreAdminDelegates, refreshAdminLists } = garageData;
  const { isLoading, setIsLoading, newPlateNumber, setNewPlateNumber, setSelectedVehicle, handleCheckIn, setShowCheckOutModal, checkoutJustSucceeded } = vehicleOperations;
  const { activeAdminPin, handleGarageLogin, createNewGarage, updateGarageRate, addDelegate, removeDelegate } = adminManagement;
  const { loginPhone, setLoginPhone, showToast, closeKeyboard, isInputFocused, setIsInputFocused, plateInputRef, inputRef, now, showStaffStats, setShowStaffStats, showSubscribers, setShowSubscribers } = navigationUi;

  logDiagnostic('RENDER_VIEW_EVALUATED', { view, isAuthReady, isLoading });

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

  if (view === 'admin_dashboard') return <ErrorBoundary><AdminDashboardLazy allGarages={allGarages} isLoading={isLoading} createNewGarage={createNewGarage} setView={setView} setSelectedGarageForDetails={navigationUi.setSelectedGarageForDetails} setSelectedDelegateForDetails={navigationUi.setSelectedDelegateForDetails} delegates={delegates} addDelegate={addDelegate} onLogout={handleInitiateLogout} adminGarageHasMore={adminGarageHasMore} adminDelegateHasMore={adminDelegateHasMore} adminListsLoading={adminListsLoading} adminListsError={adminListsError} onLoadMoreAdminGarages={loadMoreAdminGarages} onLoadMoreAdminDelegates={loadMoreAdminDelegates} onRefreshAdminLists={refreshAdminLists} currentAdminPin={activeAdminPin} showToast={showToast} /></ErrorBoundary>;

  if (view === 'delegate_dashboard' && delegate) return <ErrorBoundary><DelegateDashboardLazy delegate={delegate} allGarages={delegateGarages} onLogout={handleInitiateLogout} onCreateGarage={createNewGarage} isLoading={isLoading} delegatePagination={delegatePagination} delegateListsLoading={delegateListsLoading} delegateListsError={delegateListsError} delegateDashboardLoading={delegateDashboardLoading} delegateDashboardError={delegateDashboardError} onRetryDelegateDashboard={retryDelegateDashboard} onLoadMoreDelegateGarages={loadMoreDelegateGarages} /></ErrorBoundary>;

  if (view === 'admin_garage_details' && selectedGarageForDetails) return <ErrorBoundary><AdminGarageDetailsLazy selectedGarageForDetails={selectedGarageForDetails} setView={setView} setSelectedGarageForDetails={navigationUi.setSelectedGarageForDetails} setShowDeleteConfirm={navigationUi.setShowDeleteConfirm} updateGarageRate={updateGarageRate} staffList={staffList} setStaffList={setStaffList} isLoading={isLoading} setIsLoading={setIsLoading} allGarages={allGarages} onRefreshAdminLists={refreshAdminLists} /></ErrorBoundary>;

  if (view === 'admin_delegate_details' && selectedDelegateForDetails) {
    const liveDelegate = delegates.find(d => d.id === selectedDelegateForDetails.id) || selectedDelegateForDetails;
    return <ErrorBoundary><AdminDelegateDetailsLazy delegate={liveDelegate} setView={setView} setSelectedDelegate={navigationUi.setSelectedDelegateForDetails} removeDelegate={removeDelegate} /></ErrorBoundary>;
  }

  if (view === 'garage' && garage) return <ErrorBoundary><GarageDashboardLazy garage={garage} currentStaff={currentStaff} isInputFocused={isInputFocused} now={showStaffStats ? now : undefined} vehicles={app.garageData.vehicles} todayTransactions={app.garageData.todayTransactions} setSelectedVehicle={setSelectedVehicle} setShowCheckOutModal={setShowCheckOutModal} closeKeyboard={closeKeyboard} newPlateNumber={newPlateNumber} setNewPlateNumber={setNewPlateNumber} setIsInputFocused={setIsInputFocused} plateInputRef={plateInputRef} handleCheckIn={handleCheckIn} inputRef={inputRef} onLogout={handleInitiateLogout} showToast={showToast} staffList={staffList} showStaffStats={showStaffStats} setShowStaffStats={setShowStaffStats} showSubscribers={showSubscribers} setShowSubscribers={setShowSubscribers} isLoading={isLoading} checkoutJustSucceeded={checkoutJustSucceeded} /></ErrorBoundary>;

  return <LoginView loginPhone={loginPhone} setLoginPhone={setLoginPhone} handleGarageLogin={handleGarageLogin} isLoading={isLoading || !isAuthReady} closeKeyboard={closeKeyboard} />;
}
