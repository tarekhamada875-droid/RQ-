import { useEffect, useRef } from 'react';

interface BackTrappingProps {
  view: string;
  setView: (view: any) => void;
  showCheckInModal: boolean;
  setShowCheckInModal: (val: boolean) => void;
  showCheckOutModal: boolean;
  setShowCheckOutModal: (val: boolean) => void;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: (val: boolean) => void;
  showLogoutConfirm: boolean;
  setShowLogoutConfirm: (val: boolean) => void;
  showRecentExitWarning: boolean;
  setShowRecentExitWarning: (val: boolean) => void;
  showSubscriberWarning: boolean;
  setShowSubscriberWarning: (val: boolean) => void;
  showSubscribers: boolean;
  setShowSubscribers: (val: boolean) => void;
  setSelectedVehicle: (vehicle: any | null) => void;
  setSelectedGarageForDetails: (garage: any | null) => void;
  setSelectedDelegateForDetails: (delegate: any | null) => void;
  setRecentVehicle: (vehicle: any | null) => void;
  setSubscriberWarningPlate: (plate: string) => void;
  /** Garage-level overlays (reports, recharge history, appearance, terms,
   * active-vehicles tab, recharge notification, menu drawer). */
  garageBackHandlerRef: React.MutableRefObject<(() => boolean) | null>;
  /** Admin-level modals (Add Garage, Export, Appearance, ConfirmDialog,
   * settings sub-tabs: admin-pin, active_sessions, wallet_settings). */
  adminBackHandlerRef: React.MutableRefObject<(() => boolean) | null>;
  /** Delegate-level modals (Add Garage, Credit Request, Terms). */
  delegateBackHandlerRef: React.MutableRefObject<(() => boolean) | null>;
  /** Admin garage-details modals (Add Staff, Delete Staff, Edit PIN).
   * Must be checked BEFORE the admin_garage_details → admin_dashboard
   * fallthrough so back closes the in-page modal instead of exiting. */
  adminGarageDetailsBackHandlerRef: React.MutableRefObject<(() => boolean) | null>;
  /** Admin delegate-details confirm dialogs (Delete, Settle). */
  adminDelegateDetailsBackHandlerRef: React.MutableRefObject<(() => boolean) | null>;
}

/**
 * Mobile back-button navigation.
 *
 * Priority order (first match wins):
 * 1. App-level modals (logout, check-out, check-in, delete, warnings)
 * 2. View-specific overlays via refs:
 *    a. garageBackHandlerRef — garage overlays + active-vehicles + notifications
 *    b. adminBackHandlerRef — admin modals + settings sub-tabs
 *    c. delegateBackHandlerRef — delegate modals
 *    d. adminGarageDetailsBackHandlerRef — garage-details modals (before exit!)
 *    e. adminDelegateDetailsBackHandlerRef — delegate-details confirms (before exit!)
 * 3. Admin sub-pages → go to admin_dashboard
 * 4. Main dashboards → show logout confirm
 * 5. Login → do nothing
 *
 * The history trap (3-deep) prevents rapid back presses from exiting the PWA.
 */
export function useBackTrapping(props: BackTrappingProps) {
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const handleBack = (): void => {
      const p = propsRef.current;

      // 1. App-level modals (logout confirm first; then check-out, check-in, etc.)
      if (p.showLogoutConfirm) { p.setShowLogoutConfirm(false); return; }
      if (p.showCheckOutModal) { p.setShowCheckOutModal(false); return; }
      if (p.showCheckInModal) { p.setShowCheckInModal(false); p.setSelectedVehicle(null); return; }
      if (p.showDeleteConfirm) { p.setShowDeleteConfirm(false); return; }
      if (p.showRecentExitWarning) { p.setShowRecentExitWarning(false); p.setRecentVehicle(null); return; }
      if (p.showSubscriberWarning) { p.setShowSubscriberWarning(false); p.setSubscriberWarningPlate(''); return; }

      // 2. View-specific overlays via refs. Each ref returns true if it closed
      //    something. Try them in order; first one that closes wins.
      // 2a. Garage overlays (subscribers is at App level; rest via ref)
      if (p.showSubscribers) { p.setShowSubscribers(false); return; }
      if (p.garageBackHandlerRef.current) {
        if (p.garageBackHandlerRef.current()) return;
      }
      // 2b. Admin modals + settings sub-tabs
      if (p.adminBackHandlerRef.current) {
        if (p.adminBackHandlerRef.current()) return;
      }
      // 2c. Delegate modals
      if (p.delegateBackHandlerRef.current) {
        if (p.delegateBackHandlerRef.current()) return;
      }
      // 2d. Admin garage-details modals — MUST come before priority 3 exit
      if (p.adminGarageDetailsBackHandlerRef.current) {
        if (p.adminGarageDetailsBackHandlerRef.current()) return;
      }
      // 2e. Admin delegate-details confirms — MUST come before priority 3 exit
      if (p.adminDelegateDetailsBackHandlerRef.current) {
        if (p.adminDelegateDetailsBackHandlerRef.current()) return;
      }

      // 3. Admin sub-pages → go back to admin dashboard
      if (p.view === 'admin_garage_details') { p.setView('admin_dashboard'); p.setSelectedGarageForDetails(null); return; }
      if (p.view === 'admin_delegate_details') { p.setView('admin_dashboard'); p.setSelectedDelegateForDetails(null); return; }

      // 4. Main dashboards → show logout confirmation (NOT exit)
      if (p.view === 'garage' || p.view === 'admin_dashboard' || p.view === 'delegate_dashboard') {
        p.setShowLogoutConfirm(true);
        return;
      }

      // 5. Login screens → do nothing (don't exit the PWA)
    };

    const handlePopState = (): void => {
      // 3-deep buffer so rapid back presses don't exhaust the history stack.
      try {
        window.history.pushState({ trapped: true }, '');
        window.history.pushState({ trapped: true }, '');
        window.history.pushState({ trapped: true }, '');
      } catch {
        /* ignore */
      }
      handleBack();
    };

    try {
      window.history.pushState({ trapped: true }, '');
      window.history.pushState({ trapped: true }, '');
      window.history.pushState({ trapped: true }, '');
    } catch {
      /* ignore */
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
