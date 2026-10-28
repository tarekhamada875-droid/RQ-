import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Subscriber } from '../types';

export interface FinancialReportData {
  grossRechargeTotal: number;
  walletTopupTotal: number;
  prepaidCreditPaymentsEgp: number | null;
  cashCollectedTotal: number;
  commissionTotal: number;
  refundTotal: number;
  companyNetRevenue: number;
  historicalSettledTotal: number;
  currentUnsettledByDelegate: Record<string, number>;
  creditActivity: CreditActivityMetrics | null;
}

export interface CreditActivityMetrics {
  paidGrantCount: number;
  paidCreditsGranted: number;
  paidGrantCountWithoutEgpRecord: number;
  paidCreditsWithoutEgpRecord: number;
  referralAwardCount: number;
  referralCreditsGranted: number;
  trialGrantCount: number;
  trialCreditsGranted: number;
  regularEntryDebitCount: number;
  regularEntryCreditsConsumed: number;
  regularEntryPaidCreditsConsumed: number;
  regularEntryReferralCreditsConsumed: number;
  regularEntryTrialCreditsConsumed: number;
  subscriberRenewalCount: number;
  subscriberRenewalCreditsConsumed: number;
  correctionRestoreCount: number;
  restoredCredits: number;
  restoredPaidCredits: number;
  restoredReferralCredits: number;
  restoredTrialCredits: number;
}

export interface FinancialReportFilters {
  start: string;
  end: string;
}

export interface AdminSummary {
  totalGarages: number;
  activeGarages: number;
  lockedGarages: number;
  totalDelegates: number;
  totalAdminRevenue: number;
  activeAnnouncements: number;
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
