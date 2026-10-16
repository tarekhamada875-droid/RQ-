import { useEffect, useMemo, useState } from 'react';
import { firestoreService } from '../services';
import type { SubscriberPageInfo } from '../services/adminService';
import type { ActivityLog, Subscriber } from '../types';

export interface SharedSubscriberPage extends SubscriberPageInfo {
  garageId: string | null;
  subscribers: Subscriber[];
  hasSnapshot: boolean;
}

interface RechargeState {
  garageId: string | null;
  logs: ActivityLog[];
  isLoading: boolean;
}

interface SubscriberState extends SharedSubscriberPage {}

const EMPTY_RECHARGE_STATE: RechargeState = {
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
  isRechargeHistoryOpen: boolean;
  shouldSubscribeToSubscribers: boolean;
}

/**
 * Owns the garage dashboard's live recharge and first subscriber-page data.
 * Overlays receive these snapshots as props instead of opening duplicate listeners.
 */
export function useGarageDashboardLiveData({
  garageId,
  isAuthenticated,
  isRechargeHistoryOpen,
  shouldSubscribeToSubscribers,
}: UseGarageDashboardLiveDataOptions) {
  const [rechargeState, setRechargeState] = useState<RechargeState>(EMPTY_RECHARGE_STATE);
  const [subscriberState, setSubscriberState] = useState<SubscriberState>(EMPTY_SUBSCRIBER_PAGE);

  useEffect(() => {
    if (!garageId || !isAuthenticated) {
      setRechargeState({ garageId: garageId ?? null, logs: [], isLoading: false });
      return;
    }

    let active = true;
    let receivedInitialSnapshot = false;
    setRechargeState((current) => ({
      garageId,
      logs: current.garageId === garageId ? current.logs : [],
      isLoading: true,
    }));

    const loadingTimeout = setTimeout(() => {
      if (active && !receivedInitialSnapshot) {
        setRechargeState((current) => current.garageId === garageId
          ? { ...current, isLoading: false }
          : current);
      }
    }, 1500);

    const unsubscribe = firestoreService.subscribeToGarageRechargeLogs(
      garageId,
      (logs) => {
        if (!active) return;
        receivedInitialSnapshot = true;
        clearTimeout(loadingTimeout);
        setRechargeState({ garageId, logs, isLoading: false });
      },
      isRechargeHistoryOpen ? 50 : 1,
      () => {
        if (!active) return;
        receivedInitialSnapshot = true;
        clearTimeout(loadingTimeout);
        setRechargeState((current) => current.garageId === garageId
          ? { ...current, isLoading: false }
          : current);
      },
    );

    return () => {
      active = false;
      clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, [garageId, isAuthenticated, isRechargeHistoryOpen]);

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

    const unsubscribe = firestoreService.subscribeToSubscribers(garageId, (subscribers, page) => {
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

  const rechargeLogs = isAuthenticated && rechargeState.garageId === garageId
    ? rechargeState.logs
    : EMPTY_RECHARGE_LOGS;
  const isRechargeLoading = Boolean(
    isAuthenticated && garageId && (rechargeState.garageId !== garageId || rechargeState.isLoading),
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
    rechargeLogs,
    isRechargeLoading,
    subscriberPage,
  };
}
