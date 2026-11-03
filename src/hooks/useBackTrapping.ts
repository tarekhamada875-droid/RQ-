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
  /** Ref to a function that closes the topmost garage-level overlay
   * (reports, recharge history, appearance, terms). Returns true if an
   * overlay was closed, false if none was open. Populated by
   * GarageDashboardView. */
  garageBackHandlerRef: React.MutableRefObject<(() => boolean) | null>;
}

/**
 * Mobile back-button navigation.
 *
 * Priority order (first match wins):
 * 1. App-level modals → close the topmost modal
 * 2. Garage-level overlays (via garageBackHandlerRef) → close the topmost
 * 3. Admin sub-pages (admin_garage_details, admin_delegate_details) → go to admin_dashboard
 * 4. Main dashboards (garage, admin_dashboard, delegate_dashboard) → show logout confirm
 * 5. Login screens → do nothing (don't exit the app)
 *
 * The history trap prevents the browser from navigating away / exiting the PWA
 * on the first back press. Instead, the back press is intercepted and the
 * appropriate navigation action is performed.
 */
export function useBackTrapping(props: BackTrappingProps) {
  // Keep the latest props in a ref so the popstate handler always sees fresh
  // state without needing to re-bind the event listener on every state change.
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const handleBack = (): void => {
      const p = propsRef.current;

      // 1. App-level modals (check-out first — it's the most "in-progress")
      if (p.showCheckOutModal) { p.setShowCheckOutModal(false); return; }
      if (p.showCheckInModal) { p.setShowCheckInModal(false); p.setSelectedVehicle(null); return; }
      if (p.showDeleteConfirm) { p.setShowDeleteConfirm(false); return; }
      if (p.showRecentExitWarning) { p.setShowRecentExitWarning(false); p.setRecentVehicle(null); return; }
      if (p.showSubscriberWarning) { p.setShowSubscriberWarning(false); p.setSubscriberWarningPlate(''); return; }

      // 2. Garage-level overlays (subscribers is at the App level; the rest
      //    live inside GarageDashboardView and are reachable via the ref)
      if (p.showSubscribers) { p.setShowSubscribers(false); return; }
      if (p.garageBackHandlerRef.current) {
        const closed = p.garageBackHandlerRef.current();
        if (closed) return;
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
      // Re-push the trap so the browser doesn't navigate away on the next
      // back press. Then run the back handler.
      try {
        window.history.pushState({ trapped: true }, '');
      } catch {
        /* ignore */
      }
      handleBack();
    };

    // Push the initial trap entry on mount.
    window.history.pushState({ trapped: true }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
