// Clean, strict types for the subscription system
export type BillingModel = 'subscription' | 'trial';
export type GarageStatus = 'pending' | 'active' | 'expired' | 'locked' | 'rejected';
export type PackageType = 'limited' | 'unlimited';

export interface PackageV2 {
  id: string;
  name: string;
  price: number;
  durationDays: number;        // Always: 7, 15, 30
  dailyCapacity: number;       // Always: 0 (unlimited) or positive number
  type: PackageType;           // Derived from dailyCapacity
  isActive: boolean;
  createdAt: any;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
}

export interface GarageV2 {
  id: string;
  name: string;
  phone?: string;
  pin: string;
  ownerName?: string;
  ownerPin?: string;
  hourlyRate: number;
  overnightRate: number;
  
  // Subscription fields (always present)
  billingModel: BillingModel;
  status: GarageStatus;
  isTrial: boolean;
  balanceExpiry: any; // Timestamp — ALWAYS set, never null
  dailyCapacity: number; // ALWAYS set (0 = unlimited)
  activePackageName?: string;
  
  // Stats
  carsInside: number;
  todayCount: number;
  todayRevenue: number;
  totalRevenue: number;
  totalVehiclesOut: number;
  lastTransactionDate?: string;
  
  // Metadata
  createdAt: any;
  createdByDelegateId?: string;
  createdByDelegateName?: string;
  referrerId?: string;
  hasMonthlySubscribers?: boolean;
  referredByGarageId?: string;
  referredByGarageName?: string;
  referralRewardClaimed?: boolean;
  referralRewardAwardedAt?: any;
  totalReferralRewardDays?: number;
  totalGaragesReferredCount?: number;
  referralBonusBalance?: number;
  shimmerColor?: string;
  currentSessionId?: string;
  lastActive?: any;
}

export interface RechargeRequestV2 {
  id: string;
  garageId: string;
  garageName: string;
  delegateId: string;
  delegateName: string;
  packageId: string;
  packageName: string;
  durationDays: number;        // Clean field for duration
  dailyCapacity: number;       // Clean field for capacity
  revenueAmount: number;       // Final amount after discount
  originalRevenueAmount: number; // Price before discount
  discountAmount: number;
  commission?: number;
  referrerId?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  resolvedAt?: any;
}
