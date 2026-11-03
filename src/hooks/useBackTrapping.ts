import { useEffect, useRef } from 'react';
import { useBackHandlerStack } from './backHandler';

interface BackTrappingProps {
  view: string;
  setView: (view: any) => void;
  showLogoutConfirm: boolean;
  setShowLogoutConfirm: (val: boolean) => void;
  setSelectedGarageForDetails: (garage: any | null) => void;
  setSelectedDelegateForDetails: (delegate: any | null) => void;
}

/**
 * Mobile back-button navigation.
 *
 * Each overlay/modal/sub-tab self-registers a back handler via
 * `useBackHandler` (from backHandler.tsx). When the phone back button is
 * pressed, the stack is popped from top to bottom — the first handler that
 * returns `true` wins (the topmost overlay closes).
 *
 * If no handler on the stack consumes the back press, the FALLBACK runs:
 * 1. Admin sub-pages → admin_dashboard
 * 2. Main dashboards → show logout confirm
 * 3. Login → do nothing
 *
 * The history trap (3-deep) prevents rapid back presses from exiting the PWA.
 */
export function useBackTrapping(props: BackTrappingProps) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const popStack = useBackHandlerStack();

  useEffect(() => {
    const handleBack = (): void => {
      // 1. Try the back-handler stack first (modals, overlays, sub-tabs).
      if (popStack?.()) return;

      // 2. Fallback: view-level navigation
      const p = propsRef.current;

      if (p.view === 'admin_garage_details') { p.setView('admin_dashboard'); p.setSelectedGarageForDetails(null); return; }
      if (p.view === 'admin_delegate_details') { p.setView('admin_dashboard'); p.setSelectedDelegateForDetails(null); return; }

      if (p.view === 'garage' || p.view === 'admin_dashboard' || p.view === 'delegate_dashboard') {
        p.setShowLogoutConfirm(true);
        return;
      }

      // Login screens → do nothing (don't exit the PWA)
    };

    const handlePopState = (): void => {
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
  }, [popStack]);
}
