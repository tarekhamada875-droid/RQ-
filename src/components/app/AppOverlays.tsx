import { Suspense } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { firestoreService } from '../../services';
import type { GarageAppState } from '../../hooks/useGarageApp';

const CheckInModal = lazyWithRetry(() => import('../modals/CheckInModal').then(m => ({ default: m.CheckInModal })));
const CheckOutModal = lazyWithRetry(() => import('../modals/CheckOutModal').then(m => ({ default: m.CheckOutModal })));
const DeleteGarageConfirmModal = lazyWithRetry(() => import('../modals/DeleteGarageConfirmModal').then(m => ({ default: m.DeleteGarageConfirmModal })));
const DeleteVehicleConfirmModal = lazyWithRetry(() => import('../modals/DeleteVehicleConfirmModal').then(m => ({ default: m.DeleteVehicleConfirmModal })));
const RecentExitWarningModal = lazyWithRetry(() => import('../modals/RecentExitWarningModal').then(m => ({ default: m.RecentExitWarningModal })));
const LogoutConfirmModal = lazyWithRetry(() => import('../modals/LogoutConfirmModal').then(m => ({ default: m.LogoutConfirmModal })));
const SubscriberWarningModal = lazyWithRetry(() => import('../modals/SubscriberWarningModal').then(m => ({ default: m.SubscriberWarningModal })));

interface AppOverlaysProps {
  app: GarageAppState;
}

export function AppOverlays({ app }: AppOverlaysProps) {
  const { navigationUi, vehicleOperations, session, adminManagement } = app;
  const { view, selectedGarageForDetails, setShowDeleteConfirm, showDeleteConfirm, garageDeletionProgress, now } = navigationUi;
  const { garage, delegate } = app.garageData;
  const { currentStaff, sessionId, showLogoutConfirm, setShowLogoutConfirm, handleLogout } = session;
  const activeIdentity = view === 'garage'
    ? (currentStaff?.id ? `staff:${currentStaff.id}` : garage?.id ? `garage:${garage.id}` : 'garage:pending')
    : view === 'delegate_dashboard'
      ? (delegate?.id ? `delegate:${delegate.id}` : 'delegate:pending')
      : (view === 'admin_dashboard' || view.startsWith('admin_'))
        ? 'admin:auth-pin'
        : `view:${view}`;
  const logoutAttemptScope = `${activeIdentity}:session:${sessionId}`;
  const { newPlateNumber, selectedVehicle, showCheckInModal, setShowCheckInModal, showCheckOutModal, setShowCheckOutModal, isLoading, loadingType, handleCheckIn, confirmCheckOut, handleDeleteVehicle, showRecentExitWarning, setShowRecentExitWarning, recentVehicle, setRecentVehicle, showSubscriberWarning, setShowSubscriberWarning, subscriberWarningPlate, setSubscriberWarningPlate, pendingCheckInType, setNewPlateNumber, setSelectedVehicle } = vehicleOperations;
  const { deleteGarage } = adminManagement;

  return <Suspense fallback={null}>
    {showCheckInModal && garage && <CheckInModal newPlateNumber={newPlateNumber} garage={garage} isLoading={isLoading} loadingType={loadingType} onCheckIn={handleCheckIn} onCancel={() => setShowCheckInModal(false)} />}
    {showCheckOutModal && selectedVehicle && garage && <CheckOutModal selectedVehicle={selectedVehicle} garage={garage} currentStaff={currentStaff} isLoading={isLoading} loadingType={loadingType} now={now} onConfirm={confirmCheckOut} onDelete={handleDeleteVehicle} onCancel={() => { setShowCheckOutModal(false); setSelectedVehicle(null); }} />}
    {showDeleteConfirm && view === 'admin_garage_details' && selectedGarageForDetails && <DeleteGarageConfirmModal garage={selectedGarageForDetails} isLoading={isLoading} progress={garageDeletionProgress} onConfirm={() => deleteGarage(selectedGarageForDetails)} onCancel={() => setShowDeleteConfirm(false)} />}
    {showDeleteConfirm && selectedVehicle && <DeleteVehicleConfirmModal vehicle={selectedVehicle} isLoading={isLoading} onConfirm={handleDeleteVehicle} onCancel={() => { setShowDeleteConfirm(false); setSelectedVehicle(null); }} />}
    {showRecentExitWarning && recentVehicle && <RecentExitWarningModal vehicle={recentVehicle} now={now} onConfirm={() => { if (pendingCheckInType) { setShowRecentExitWarning(false); handleCheckIn(pendingCheckInType); } }} onCancel={() => { setShowRecentExitWarning(false); setRecentVehicle(null); setNewPlateNumber(''); }} />}
    {showSubscriberWarning && subscriberWarningPlate && <SubscriberWarningModal plateNumber={subscriberWarningPlate} onConfirm={() => { setShowSubscriberWarning(false); setSubscriberWarningPlate(''); }} />}
    {showLogoutConfirm && <LogoutConfirmModal key={logoutAttemptScope} attemptScope={logoutAttemptScope} onConfirm={handleLogout} onCancel={() => setShowLogoutConfirm(false)} onVerifyPin={firestoreService.verifyAdminPinForLogout} />}
  </Suspense>;
}
