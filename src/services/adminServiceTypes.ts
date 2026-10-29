import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Subscriber } from '../types';

export interface AdminSummary {
  totalGarages: number;
  activeGarages: number;
  lockedGarages: number;
  totalDelegates: number;
  totalAdminRevenue: number;
  timestamp: string;
}

export type SubscriberPageCursor = QueryDocumentSnapshot<DocumentData>;

export interface SubscriberPageInfo {
  lastDoc: SubscriberPageCursor | null;
  hasMore: boolean;
}

export interface SubscriberPage {
  subscribers: Subscriber[];
  lastDoc: SubscriberPageCursor | null;
  hasMore: boolean;
}
