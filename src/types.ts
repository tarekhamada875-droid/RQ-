/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Union type for Firestore timestamp values as they arrive in the client.
 *
 * Firestore can deliver timestamps in several shapes depending on the SDK
 * version, whether the value was read via `onSnapshot` vs `getDoc`, and
 * whether it was serialized through the Worker API (which returns ISO strings).
 *
 * The runtime safety net is `safeDate()` in `utils/dates.ts` — it handles
 * all of these shapes and never throws. This type exists so TypeScript can
 * catch accidental field accesses on values that aren't actually timestamps.
 */
export type FirestoreTimestamp =
  | Date
  | { seconds: number; nanoseconds?: number }
  | { toDate: () => Date }
  | string
  | number
  | null;

export type EntityRole = 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage';


export interface Garage {
  id: string;
  name: string;
  phone: string;
  pin?: string;
  ownerName?: string;
  ownerPin?: string;
  hourlyRate: number;
  overnightRate: number;
  createdAt: FirestoreTimestamp;
  currentSessionId?: string | null;
  lastActive?: FirestoreTimestamp;
  billingModel?: 'subscription' | 'prepaid_credits';
  /** Single prepaid credit balance (paid + referral + trial merged as of 2026-10-29). */
  credits?: number;
  isLocked?: boolean;
  isSuspended?: boolean;
  lockReason?: string;
  lastRateChangeDate?: FirestoreTimestamp;
  totalAdminRevenue?: number;
  totalRevenue?: number;
  totalVehiclesOut?: number;
  dailyRefundCount?: number;
  lastRefundDate?: string; // YYYY-MM-DD
  dailyDeletionCount?: number;
  lastDeletionDate?: string; // YYYY-MM-DD
  todayRevenue?: number;
  todayCount?: number;
  lastTransactionDate?: string; // YYYY-MM-DD
  checkInSound?: string;
  checkOutSound?: string;
  referredByGarageId?: string | null; // ID of referring garage
  referredByGarageName?: string | null; // Name of referring garage
  referrerId?: string | null; // ID of referring delegate
  totalGaragesReferredCount?: number; // Total count of garages referred
  shimmerColor?: string;
  activePlates?: Record<string, any>;
  carsInside?: number;
  recentExits?: any[];
  createdByDelegateId?: string | null;
  createdByDelegateName?: string | null;
  hasMonthlySubscribers?: boolean;
  dailyCapacity?: number; // Daily car limit (50, 100, 150, or 0/undefined for unlimited)
  status?: 'pending' | 'approved' | 'rejected';
  isTrial?: boolean; // Server-owned trial-credit grant indicator
}

export interface Staff {
  id: string;
  name: string;
  pin: string;
  garageId: string;
  role: 'staff';
  currentSessionId?: string | null;
  lastActive?: FirestoreTimestamp;
}

export interface Delegate {
  id: string;
  name: string;
  phone: string;
  pin: string;
  role: 'delegate';
  isActive?: boolean;
  garageCount?: number;
  currentSessionId?: string | null;
  lastActive?: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
  /** Legacy-named Worker balance for unsettled delegate commission; not gross recharge sales. */
  totalRechargedAmount?: number;
  totalCommissionEarned?: number;
  lastSettledAt?: FirestoreTimestamp;
}

export interface ActivityLog {
  id: string;
  garageId: string;
  staffId: string | null;
  staffName: string;
  actionType: 'check_in' | 'check_out' | 'recharge' | 'credit_grant' | 'delete_refund' | 'commission_earned' | 'credit_correction' | 'credit_referral_award';
  plateNumber: string;
  timestamp: FirestoreTimestamp;
  amount?: number;
  commission?: number;
  packageId?: string;
  garageName?: string;
  operatorId?: string;
  operatorName?: string;
  details?: {
    packageName?: string;
    durationDays?: number;
    carsCount?: number;
    revenueAmount?: number;
    originalRevenueAmount?: number;
    discountAmount?: number;
    requestId?: string;
    commission?: number;
    referrerId?: string;
    rechargedBy?: string;
  };
}

export interface Subscriber {
  id: string;
  plateNumber: string;
  plateNumberRaw: string;
  ownerName: string;
  phone: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  garageId: string;
  createdAt: FirestoreTimestamp;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  plateNumberRaw: string;
  entryTime: FirestoreTimestamp;
  exitTime?: FirestoreTimestamp;
  type: 'hourly' | 'overnight';
  garageId: string;
  status: 'inside' | 'outside';
  totalCost?: number;
  staffId?: string | null; // Stable entrant entity ID, not the Firebase UID
  staffName?: string;
  enteredByEntityId?: string | null;
  enteredByRole?: 'admin' | 'garage' | 'staff' | null;
  enteredByUid?: string | null; // Audit metadata only; never correction authority
  isSubscriber?: boolean;
}

export interface SystemConfig {
  id?: string;
  supportPhone?: string;
  adminColor?: string; // Persisted admin accent/shimmer color
  paymentWalletNumber?: string; // Wallet number shown to garage owners when credits are exhausted
  updatedAt?: FirestoreTimestamp;
}

export * from './types/apiContracts';
