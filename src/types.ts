/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type EntityRole = 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage';

export interface EntitySession {
  uid: string;
  role: EntityRole;
  entityId: string;
  sessionId: string;
  isActive: boolean;
  createdAt?: any;
  lastActive?: any;
}

export interface Package {
  id: string;
  name: string;
  price: number;
  vehiclesCount: number; // duration in days (e.g. 15 or 30)
  dailyCapacity?: number; // daily car capacity limit (50, 100, 150, or 0/undefined for unlimited)
  durationDays?: number; // duration in days (15 or 30)
  description?: string;
  isActive?: boolean;
  createdAt?: any;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  isActive: boolean;
  createdAt?: any;
}

export interface Garage {
  id: string;
  name: string;
  phone: string;
  pin?: string;
  ownerName?: string;
  ownerPin?: string;
  hourlyRate: number;
  overnightRate: number;
  balanceExpiry?: any; // Timestamp
  createdAt: any; // Timestamp
  balanceDays?: number;
  ownerUid?: string;
  currentSessionId?: string | null;
  lastActive?: any; // Timestamp
  billingModel?: 'subscription';
  commissionPerVehicle?: number;
  monthlySubscriptionFee?: number;
  balance?: number;
  isLocked?: boolean;
  isSuspended?: boolean;
  lockReason?: string;
  lastRateChangeDate?: any; // Timestamp or ISO date of last rate modification
  lastBalanceDeduction?: any; // Timestamp
  lastPaidFriday?: string; // YYYY-MM-DD
  totalAdminRevenue?: number;
  lastRechargeAmount?: number;
  lastRechargeDate?: any; // Timestamp
  lastRechargePackageName?: string;
  totalRevenue?: number;
  totalVehiclesOut?: number;
  totalRechargedCars?: number;
  dailyRefundCount?: number;
  lastRefundDate?: string; // YYYY-MM-DD
  dailyDeletionCount?: number;
  lastDeletionDate?: string; // YYYY-MM-DD
  todayRevenue?: number;
  todayCount?: number;
  lastTransactionDate?: string; // YYYY-MM-DD
  checkInSound?: string;
  checkOutSound?: string;
  referralBonusBalance?: number; // Cash bonus balance in EGP (fallback/manual)
  referredByGarageId?: string | null; // ID of referring garage
  referredByGarageName?: string | null; // Name of referring garage
  referrerId?: string | null; // ID of referring delegate
  referralRewardClaimed?: boolean; // Legacy field for initial 15-day reward (now 1 day per renewal)
  referralRewardAwardedAt?: any; // Timestamp
  totalReferralRewardDays?: number; // Total free subscription days earned via referrals
  totalGaragesReferredCount?: number; // Total count of garages referred
  shimmerColor?: string;
  activePlates?: Record<string, any>;
  carsInside?: number;
  recentExits?: any[];
  createdByDelegateId?: string | null;
  createdByDelegateName?: string | null;
  hasMonthlySubscribers?: boolean;
  dailyCapacity?: number; // Daily car limit (50, 100, 150, or 0/undefined for unlimited)
  activePackageName?: string; // Current package name
  status?: 'pending' | 'approved' | 'rejected';
  isTrial?: boolean; // 15-day free trial indicator
}

export interface Staff {
  id: string;
  name: string;
  pin: string;
  garageId: string;
  role: 'staff';
  currentSessionId?: string | null;
  lastActive?: any; // Timestamp
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
  lastActive?: any; // Timestamp
  createdAt: any;
  canCreateGarage?: boolean;
  commissionRate?: number;
  totalRechargedAmount?: number;
  totalCommissionEarned?: number;
  lastSettledAt?: any; // Timestamp
}

export interface Supervisor {
  id: string;
  name: string;
  phone: string;
  pin: string;
  role: 'supervisor';
  currentSessionId?: string | null;
  lastActive?: any; // Timestamp
  createdAt: any;
}

export interface ActivityLog {
  id: string;
  garageId: string;
  staffId: string | null;
  staffName: string;
  actionType: 'check_in' | 'check_out' | 'recharge' | 'delete_refund' | 'commission_payment' | 'balance_topup' | 'self_subscribe';
  plateNumber: string;
  timestamp: any;
  amount?: number;
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
    couponCode?: string;
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
  createdAt: any;
}

export interface Vehicle {
  id: string;
  plateNumber: string;
  plateNumberRaw: string;
  entryTime: any;
  exitTime?: any;
  type: 'hourly' | 'overnight';
  garageId: string;
  status: 'inside' | 'outside';
  totalCost?: number;
  staffId?: string | null;
  staffName?: string;
  isSubscriber?: boolean;
}

export interface RechargeRequest {
  id: string;
  requestType?: 'balance_topup' | 'package';
  garageId: string;
  garageName: string;
  delegateId: string;
  delegateName: string;
  packageId: string;
  packageName: string;
  amount: number;
  price?: number;
  carsCount: number;
  revenueAmount: number;
  durationDays?: number;
  dailyCapacity?: number;
  originalRevenueAmount?: number;
  couponCode?: string;
  discountAmount?: number;
  commission?: number;
  referrerId?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  resolvedAt?: any;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  target: 'all' | 'specific';
  targetGarageId?: string | null;
  targetGarageName?: string | null;
  priority: 'normal' | 'important' | 'urgent';
  isActive: boolean;
  createdAt: any;
  authorName?: string;
}

export interface SystemConfig {
  id?: string;
  defaultTrialDays: number; // e.g. 15
  warningDaysThreshold: number; // e.g. 3
  supportPhone?: string;
  walletNumber?: string;
  subscriptionPrices?: Record<string, number>;
  monthlySubscribersSurchargePercent: number;
  monthlySubscribersFlatFee: number; // e.g. 500
  referralFeePerRenewal?: number; // fallback e.g. 50
  delegatePackageCommissions?: {
    daily?: number; // 1 day
    weekly?: number; // 7 days
    biweekly?: number; // 15 days
    monthly?: number; // 30 days
    [key: string]: number | undefined;
  };
  isMaintenanceMode?: boolean;
  maintenanceMessage?: string;
  adminColor?: string; // Persisted admin accent/shimmer color
  updatedAt?: any;
}

export interface ReferralReward {
  id?: string;
  requestId: string;
  referrerGarageId: string;
  referrerGarageName: string;
  referredGarageId: string;
  referredGarageName: string;
  rewardDays: number;
  rewardPackageName?: string;
  rewardDailyCapacity?: number;
  triggeredByPackageName?: string;
  triggeredByPackageId?: string;
  createdAt: any;
  status: 'awarded';
}

// Domain V2 Types
export type { BillingModel, GarageStatus, PackageType, PackageV2, GarageV2, RechargeRequestV2 } from './domain/types';

