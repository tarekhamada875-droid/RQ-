/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { memo, Suspense, useEffect, useRef } from 'react';
import { adminService } from '../../services';
import { AdminProvider } from '../../hooks/adminContext';
import { DelayedFallback, ModalSuspenseBackdrop } from '../layout/LoadingFallbacks';
import { useSession } from '../../hooks/sessionContext';
import { Garage, Delegate } from '../../types';
import { isLightColor } from '../../utils/colors';
import { useLocalStorageState } from '../../hooks/useLocalStorage';
import { useSystemConfig } from '../../hooks/useSystemConfig';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import '../../styles/admin-custom-theme.css';

import { AdminHeader } from './AdminHeader';
import { AdminNavigationAndViews } from './AdminNavigationAndViews';
import { useAdminModals } from '../../hooks/useAdminModals';
import { useAdminGarageLists } from '../../hooks/useAdminGarageLists';
import { useAdminGarageActions } from '../../hooks/useAdminGarageActions';

// PR-G: lazy-load the admin modals so they're code-split into separate
// chunks. These modals are conditionally rendered (showAppearanceModal,
// showAddGarageModal, etc.) — eagerly importing them inflates the admin
// initial bundle with modal code that may never be needed.
const AppearanceSettingsModal = lazyWithRetry(() => import('../modals/AppearanceSettingsModal').then(m => ({ default: m.AppearanceSettingsModal })));
const AdminAddGarageModal = lazyWithRetry(() => import('./AdminAddGarageModal').then(m => ({ default: m.AdminAddGarageModal })));
const AdminConfirmDialog = lazyWithRetry(() => import('./AdminConfirmDialog').then(m => ({ default: m.AdminConfirmDialog })));

interface AdminDashboardProps {
  allGarages: Garage[];
  isLoading: boolean;
  createNewGarage: (e: React.FormEvent<HTMLFormElement>) => Promise<boolean>;
  setView: (view: any) => void;
  setSelectedGarageForDetails: (garage: Garage | null) => void;
  setSelectedDelegateForDetails: (delegate: Delegate | null) => void;
  delegates: Delegate[];
  adminGarageHasMore?: boolean;
  adminDelegateHasMore?: boolean;
  adminListsLoading?: boolean;
  adminListsError?: boolean;
  onLoadMoreAdminGarages?: () => Promise<void>;
  onLoadMoreAdminDelegates?: () => Promise<void>;
  onRefreshAdminLists?: () => Promise<void>;
  showToast?: (msg: string, type?: 'success' | 'error') => void;
}

export const AdminDashboard = memo(({
  allGarages,
  isLoading,
  createNewGarage,
  setView,
  setSelectedGarageForDetails,
  setSelectedDelegateForDetails,
  delegates,
  adminGarageHasMore = false,
  adminDelegateHasMore = false,
  adminListsLoading = false,
  adminListsError = false,
  onLoadMoreAdminGarages,
  onLoadMoreAdminDelegates,
  onRefreshAdminLists,
  showToast,
}: AdminDashboardProps) => {

  // Session + theme + admin color — small UI state that the parent owns.
  const { handleInitiateLogout, handleLogout } = useSession();
  const onLogout = handleInitiateLogout;
  const onImmediateLogout = () => handleLogout(true);
  const systemConfig = useSystemConfig();
  const [localAdminColor, setLocalAdminColor] = useLocalStorageState<string>('app_admin_color', '#10b981');
  const adminColor = systemConfig?.adminColor || localAdminColor || '#10b981';
  const resolvedAdminColor = adminColor;

  // Hamburger menu state — small enough to keep local (just a UI toggle).
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Extracted Stage 4: modal visibility + form state.
  const {
    showAddGarageModal,
    setShowAddGarageModal,
    showAppearanceSettings,
    setShowAppearanceSettings,
    confirmDialog,
    setConfirmDialog,
    pinInput,
    setPinInput,
    garageForm,
    setGarageForm,
    openAddGarageModal,
  } = useAdminModals();

  // Lock body scroll while the Add Garage modal is open.
  useBodyScrollLock(showAddGarageModal);

  // Extracted Stage 4: tab navigation + garage list pipeline.
  const {
    activeTab,
    setActiveTab,
    adminSearch,
    setAdminSearch,
    approvedGarages,
    pendingGarages,
    displayedGarages,
    mainScrollRef,
  } = useAdminGarageLists(allGarages);

  // Extracted Stage 4: garage lifecycle handlers (approve / reject / add).
  // Depends on the modal-state setters from useAdminModals.
  const {
    handleApproveGarage,
    handleRejectGarage,
    handleAddGarage,
  } = useAdminGarageActions({
    onRefreshAdminLists,
    createNewGarage,
    showToast,
    setConfirmDialog,
    setShowAddGarageModal,
  });

  return (
    <div
      className={`admin-custom-theme h-screen h-[100dvh] w-full bg-[#faf9f6] dark:bg-slate-950 font-sans relative text-slate-900 dark:text-slate-100 overflow-hidden flex flex-col`}
      dir="rtl"
      style={{ '--admin-color': resolvedAdminColor, '--admin-color-text': isLightColor(resolvedAdminColor) ? '#0f172a' : '#ffffff' } as React.CSSProperties}
    >
      
      {/* Header */}
      <AdminHeader
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        onOpenAppearanceSettings={() => setShowAppearanceSettings(true)}
        onLogout={onLogout}
        menuRef={menuRef}
      />

      {/* Main Workspace Body */}
      <main 
        ref={mainScrollRef} 
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 flex-1 w-full ${showAddGarageModal ? 'overflow-hidden' : 'overflow-y-auto'}`}
      >
        <AdminProvider value={{
          adminGarageHasMore,
          adminDelegateHasMore,
          adminListsLoading,
          adminListsError,
          onLoadMoreAdminGarages: onLoadMoreAdminGarages ?? (() => Promise.resolve()),
          onLoadMoreAdminDelegates: onLoadMoreAdminDelegates ?? (() => Promise.resolve()),
          onRefreshAdminLists: onRefreshAdminLists ?? (() => Promise.resolve()),
          setSelectedGarageForDetails,
          setSelectedDelegateForDetails,
        }}>
        <AdminNavigationAndViews
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          delegates={delegates}
          pendingGarages={pendingGarages}
          approvedGarages={approvedGarages}
          displayedGarages={displayedGarages}
          adminSearch={adminSearch}
          setAdminSearch={setAdminSearch}
          onSelectGarage={(g) => {
            setSelectedGarageForDetails(g);
            setView('admin_garage_details');
          }}
          onSelectDelegate={(d) => {
            setSelectedDelegateForDetails(d);
            setView('admin_delegate_details');
          }}
          onOpenAddGarage={openAddGarageModal}
          handleApproveGarage={handleApproveGarage}
          handleRejectGarage={handleRejectGarage}
          showToast={showToast}
          onLogout={onLogout}
          onImmediateLogout={onImmediateLogout}
        />
        </AdminProvider>
      </main>

      {/* PR-G: lazy-loaded modals wrapped in Suspense.
          UX-C: AdminAddGarageModal/AdminConfirmDialog render unconditionally
          (isOpen prop) — this boundary silently pre-warms their chunks at
          dashboard mount, so it keeps fallback={null} (a visible backdrop
          would flash on every admin dashboard open). The conditional
          AppearanceSettingsModal gets its own boundary with a real backdrop
          so its first-ever tap is never a dead tap. */}
      <Suspense fallback={null}>
      {/* Add Garage Modal */}
      <AdminAddGarageModal
        isOpen={showAddGarageModal}
        onClose={() => setShowAddGarageModal(false)}
        garageForm={garageForm}
        setGarageForm={setGarageForm}
        pinInput={pinInput}
        setPinInput={setPinInput}
        allGarages={allGarages}
        isLoading={isLoading}
        onSubmit={handleAddGarage}
      />

      {/* Custom Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => {
          confirmDialog.onCancel?.();
          setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        }}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        type={confirmDialog.type}
      />
      </Suspense>

      {/* Appearance Settings Modal — conditional, so a real backdrop is safe */}
      {showAppearanceSettings && (
        <Suspense fallback={<DelayedFallback><ModalSuspenseBackdrop /></DelayedFallback>}>
          <AppearanceSettingsModal
            onClose={() => setShowAppearanceSettings(false)}
            adminColor={adminColor}
            onUpdateAdminColor={async (color) => {
              setLocalAdminColor(color);
              try {
                await adminService.updateSystemConfig({ adminColor: color });
              } catch (err) {
                console.warn('Failed to save adminColor to Firestore:', err);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
});
