import { useState, useEffect, useRef, useMemo } from 'react';
import { firestoreService } from '../../../services';
import { auth } from '../../../firebase';
import type { Subscriber } from '../../../types';
import { normalizeArabicSearch, safeDate } from '../../../utils';
import type { SharedSubscriberPage } from '../../../hooks/useGarageDashboardLiveData';
import type { SubscriberPageCursor } from '../../../services/adminService';

/**
 * Subscriber list state + Firestore subscription + pagination.
 *
 * Extracted from SubscribersView so the form state (plate/name/phone/dates)
 * no longer re-renders the list on every keystroke. The list only re-renders
 * when subscribers, search, or pagination state actually change.
 */
export function useSubscriberList(
  garageId: string,
  subscriberPage: SharedSubscriberPage | null,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void,
) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subscriberCursor, setSubscriberCursor] = useState<SubscriberPageCursor | null>(null);
  const [hasMoreSubscribers, setHasMoreSubscribers] = useState(false);
  const [isLoadingMoreSubscribers, setIsLoadingMoreSubscribers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAuthResolved, setIsAuthResolved] = useState(!!auth.currentUser);

  const hasReceivedSubscriberSnapshotRef = useRef(false);
  const activeGarageIdRef = useRef<string | null>(null);
  const subscriberRequestGenerationRef = useRef(0);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setIsAuthResolved(!!u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthResolved) return;
    if (activeGarageIdRef.current !== garageId) {
      activeGarageIdRef.current = garageId;
      subscriberRequestGenerationRef.current += 1;
      hasReceivedSubscriberSnapshotRef.current = false;
      setSubscribers([]);
      setSubscriberCursor(null);
      setHasMoreSubscribers(false);
      setIsLoadingMoreSubscribers(false);
    }

    if (subscriberPage) {
      if (subscriberPage.garageId !== garageId || !subscriberPage.hasSnapshot) return;
      setSubscribers((current) =>
        hasReceivedSubscriberSnapshotRef.current
          ? mergeSubscriberPages(current, subscriberPage.subscribers)
          : subscriberPage.subscribers,
      );
      hasReceivedSubscriberSnapshotRef.current = true;
      setSubscriberCursor(subscriberPage.lastDoc);
      setHasMoreSubscribers(subscriberPage.hasMore);
      return;
    }

    hasReceivedSubscriberSnapshotRef.current = false;
    setSubscribers([]);
    setSubscriberCursor(null);
    setHasMoreSubscribers(false);
    const unsub = firestoreService.subscribeToSubscribers(garageId, (data, page) => {
      setSubscribers((current) =>
        hasReceivedSubscriberSnapshotRef.current
          ? mergeSubscriberPages(current, data)
          : data,
      );
      hasReceivedSubscriberSnapshotRef.current = true;
      setSubscriberCursor(page.lastDoc);
      setHasMoreSubscribers(page.hasMore);
    });

    return () => {
      unsub();
    };
  }, [garageId, isAuthResolved, subscriberPage]);

  const filteredSubscribers = useMemo(() => {
    const q = normalizeArabicSearch(searchQuery);
    if (!q) return subscribers;

    return subscribers.filter((s) => {
      const normalizedPlate = normalizeArabicSearch(s.plateNumber);
      const normalizedName = normalizeArabicSearch(s.ownerName);
      const normalizedPhone = normalizeArabicSearch(s.phone);

      return normalizedPlate.includes(q) || normalizedName.includes(q) || normalizedPhone.includes(q);
    });
  }, [subscribers, searchQuery]);

  const handleLoadMoreSubscribers = async () => {
    if (!subscriberCursor || !hasMoreSubscribers || isLoadingMoreSubscribers) return;
    const requestedGarageId = garageId;
    const requestGeneration = subscriberRequestGenerationRef.current;
    const requestedCursor = subscriberCursor;
    setIsLoadingMoreSubscribers(true);
    try {
      const page = await firestoreService.getMoreSubscribers(requestedGarageId, requestedCursor);
      if (
        requestGeneration !== subscriberRequestGenerationRef.current ||
        activeGarageIdRef.current !== requestedGarageId
      )
        return;
      setSubscribers((current) => mergeSubscriberPages(current, page.subscribers));
      setSubscriberCursor(page.lastDoc);
      setHasMoreSubscribers(page.hasMore);
    } catch {
      if (
        requestGeneration !== subscriberRequestGenerationRef.current ||
        activeGarageIdRef.current !== requestedGarageId
      )
        return;
      showToast('تعذر تحميل المزيد من المشتركين. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
      if (requestGeneration === subscriberRequestGenerationRef.current) {
        setIsLoadingMoreSubscribers(false);
      }
    }
  };

  return {
    subscribers,
    filteredSubscribers,
    hasMoreSubscribers,
    isLoadingMoreSubscribers,
    searchQuery,
    setSearchQuery,
    handleLoadMoreSubscribers,
  };
}

/** Merge + deduplicate by id, sorted by createdAt descending (then id as tiebreaker). */
function mergeSubscriberPages(current: Subscriber[], incoming: Subscriber[]): Subscriber[] {
  const byId = new Map(current.map((subscriber) => [subscriber.id, subscriber]));
  for (const subscriber of incoming) byId.set(subscriber.id, subscriber);
  return [...byId.values()].sort((a, b) => {
    const createdAtDifference = safeDate(b.createdAt).getTime() - safeDate(a.createdAt).getTime();
    return createdAtDifference || b.id.localeCompare(a.id);
  });
}
