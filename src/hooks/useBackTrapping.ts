import { useEffect } from 'react';

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
  showPackages: boolean;
  setShowPackages: (val: boolean) => void;
  showStaffStats: boolean;
  setShowStaffStats: (val: boolean) => void;
  showSubscribers: boolean;
  setShowSubscribers: (val: boolean) => void;
  setSelectedVehicle: (vehicle: any | null) => void;
  setSelectedGarageForDetails: (garage: any | null) => void;
  setSelectedDelegateForDetails: (delegate: any | null) => void;
  setRecentVehicle: (vehicle: any | null) => void;
  setSubscriberWarningPlate: (plate: string) => void;
}

export function useBackTrapping(_props: BackTrappingProps) {
  // The mobile back button is now fully disabled.
  // All navigation is handled by in-app close (X) buttons.
  // This hook only pushes a history entry on mount and re-pushes on popstate
  // to prevent the browser from navigating away or exiting the app.

  useEffect(() => {
    const handlePopState = () => {
      // Re-push immediately to keep the back button trapped.
      // No navigation, no modal closing — the user must use in-app X buttons.
      try {
        window.history.pushState({ trapped: true }, '');
      } catch {
        /* ignore */
      }
    };

    // Push on mount to trap the current history entry
    window.history.pushState({ trapped: true }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
}
