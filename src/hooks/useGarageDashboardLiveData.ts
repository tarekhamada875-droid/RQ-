import { useEffect, useMemo, useState } from 'react';
import { adminService } from '../services';
import type { SubscriberPageInfo } from '../services/adminService';
import type { ActivityLog, Subscriber } from '../types';

export interface SharedSubscriberPage extends SubscriberPageInfo {
  garageId: string | null;
  subscribers: Subscriber[];
  hasSnapshot: boolean;
}

interface CreditGrantState {
  garageId: string | null;
  logs: ActivityLog[];
  isLoading: boolean;
}

interface SubscriberState extends SharedSubscriberPage {}

const EMPTY_CREDIT_GRANT_STATE: CreditGrantState = {
  garageId: null,
  logs: [],
  isLoading: false,
};
const EMPTY_RECHARGE_LOGS: ActivityLog[] = [];

const EMPTY_SUBSCRIBER_PAGE: SharedSubscriberPage = {
  garageId: null,
  subscribers: [],
  lastDoc: null,
  hasMore: false,
  hasSnapshot: false,
};

export interface UseGarageDashboardLiveDataOptions {
  garageId?: string;
  isAuthenticated: boolean;
  isCreditGrantHistoryOpen: boolean;
  shouldSubscribeToSubscribers: boolean;
}

/**
 * Owns the garage dashboard's live credit grant and first subscriber-page data.
 * Overlays receive these snapshots as props instead of opening duplicate listeners.
 */
export function useGarageDashboardLiveData({
  garageId,
  isAuthenticated,
  isCreditGrantHistoryOpen,
  shouldSubscribeToSubscribers,
}: UseGarageDashboardLiveDataOptions) {
  const [creditGrantState, setCreditGrantState] = useState<CreditGrantState>(EMPTY_CREDIT_GRANT_STATE);
  const [subscriberState, setSubscriberState] = useState<SubscriberState>(EMPTY_SUBSCRIBER_PAGE);

  useEffect(() => {
    if (!garageId || !isAuthenticated || !isCreditGrantHistoryOpen) {
      // Modal-on-demand listener: only subscribe while the credit-grant-history
      // overlay is open. The dashboard's "new credit grant" badge no longer
      // depends on this listener — it reads `garage.lastCreditGrantAt` from
      // the existing garage-doc subscription (see useCreditGrantNotification).
      // Closing the modal tears the listener down; reopening it re-runs the
      // limit-50 query. Zero Firestore reads while the modal is closed.
      setCreditGrantState({ garageId: garageId ?? null, logs: [], isLoading: false });
      return;
    }

    let active = true;
    let receivedInitialSnapshot = false;
    setCreditGrantState((current) => ({
      garageId,
      logs: current.garageId === garageId ? current.logs : [],
      isLoading: true,
    }));

    const loadingTimeout = setTimeout(() => {
      if (active && !receivedInitialSnapshot) {
        setCreditGrantState((current) => current.garageId === garageId
          ? { ...current, isLoading: false }
          : current);
      }
    }, 1500);

    const unsubscribe = adminService.subscribeToCreditGrantLogs(
      garageId,
      (logs) => {
        if (!active) return;
        receivedInitialSnapshot = true;
        clearTimeout(loadingTimeout);
        setCreditGrantState({ garageId, logs, isLoading: false });
      },
      50, // always 50 — no longer toggles between 1 and 50 since closed = no listener
      () => {
        if (!active) return;
        receivedInitialSnapshot = true;
        clearTimeout(loadingTimeout);
        setCreditGrantState((current) => current.garageId === garageId
          ? { ...current, isLoading: false }
          : current);
      },
    );

    return () => {
      active = false;
      clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, [garageId, isAuthenticated, isCreditGrantHistoryOpen]);

  useEffect(() => {
    if (!garageId || !isAuthenticated || !shouldSubscribeToSubscribers) {
      setSubscriberState({
        ...EMPTY_SUBSCRIBER_PAGE,
        garageId: garageId ?? null,
      });
      return;
    }

    let active = true;
    setSubscriberState({
      ...EMPTY_SUBSCRIBER_PAGE,
      garageId,
    });

    const unsubscribe = adminService.subscribeToSubscribers(garageId, (subscribers, page) => {
      if (!active) return;
      setSubscriberState({
        garageId,
        subscribers,
        lastDoc: page.lastDoc,
        hasMore: page.hasMore,
        hasSnapshot: true,
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [garageId, isAuthenticated, shouldSubscribeToSubscribers]);

  const creditGrantLogs = isAuthenticated && creditGrantState.garageId === garageId
    ? creditGrantState.logs
    : EMPTY_RECHARGE_LOGS;
  const isCreditGrantLoading = Boolean(
    isAuthenticated && garageId && (creditGrantState.garageId !== garageId || creditGrantState.isLoading),
  );

  const subscriberPage = useMemo(() => {
    if (
      !isAuthenticated ||
      !shouldSubscribeToSubscribers ||
      subscriberState.garageId !== garageId
    ) {
      return {
        ...EMPTY_SUBSCRIBER_PAGE,
        garageId: garageId ?? null,
      };
    }
    return subscriberState;
  }, [garageId, isAuthenticated, shouldSubscribeToSubscribers, subscriberState]);

  return {
    creditGrantLogs,
    isCreditGrantLoading,
    subscriberPage,
  };
}
