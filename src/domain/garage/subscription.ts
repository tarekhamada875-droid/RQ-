import { getCairoDateKey } from './businessDay';
import { safeDate } from '../../utils';

export const isSubscriptionExpired = (garage: any): boolean => {
  if (!garage) return true;
  
  // Trial garages
  if (garage.isTrial === true) {
    if (!garage.balanceExpiry) return false; // No expiry = still in trial
    return safeDate(garage.balanceExpiry) < new Date();
  }
  
  // Regular garages — always require balanceExpiry
  if (!garage.balanceExpiry) {
    // Grace period for newly created garages (5 minutes)
    if (garage.createdAt) {
      const created = safeDate(garage.createdAt);
      if (Date.now() - created.getTime() < 5 * 60 * 1000) {
        return false;
      }
    }
    return true;
  }
  
  return safeDate(garage.balanceExpiry) < new Date();
};

export const getRemainingDays = (garage: any): number => {
  if (!garage) return 0;
  
  if (garage.isTrial === true) {
    if (!garage.balanceExpiry) {
      if (garage.createdAt) {
        const created = safeDate(garage.createdAt);
        const trialExpiry = new Date(created.getTime() + 15 * 24 * 60 * 60 * 1000);
        const diff = trialExpiry.getTime() - Date.now();
        return Math.max(0, Math.min(15, Math.ceil(diff / (1000 * 60 * 60 * 24))));
      }
      return 15;
    }
    const expiry = safeDate(garage.balanceExpiry);
    const diff = expiry.getTime() - Date.now();
    const days = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    return Math.min(days, 15);
  }

  if (!garage.balanceExpiry) return 0;
  
  const expiry = safeDate(garage.balanceExpiry);
  const diff = expiry.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

export interface RemainingSubscriptionInfo {
  days: number;
  remainingHours: number;
  remainingMs: number;
  isUrgentRed: boolean; // True when <= 5 hours or expired
  unit: 'days' | 'hours';
  displayCount: number;
}

export const getRemainingSubscriptionInfo = (garage: any): RemainingSubscriptionInfo => {
  if (!garage) {
    return { days: 0, remainingHours: 0, remainingMs: 0, isUrgentRed: true, unit: 'days', displayCount: 0 };
  }

  let expiryDate: Date | null = null;

  if (garage.isTrial === true) {
    if (!garage.balanceExpiry) {
      if (garage.createdAt) {
        const created = safeDate(garage.createdAt);
        expiryDate = new Date(created.getTime() + 15 * 24 * 60 * 60 * 1000);
      } else {
        return { days: 15, remainingHours: 360, remainingMs: 15 * 86400000, isUrgentRed: false, unit: 'days', displayCount: 15 };
      }
    } else {
      expiryDate = safeDate(garage.balanceExpiry);
    }
  } else {
    if (!garage.balanceExpiry) {
      return { days: 0, remainingHours: 0, remainingMs: 0, isUrgentRed: true, unit: 'days', displayCount: 0 };
    }
    expiryDate = safeDate(garage.balanceExpiry);
  }

  const nowMs = Date.now();
  const remainingMs = expiryDate.getTime() - nowMs;

  if (remainingMs <= 0) {
    return { days: 0, remainingHours: 0, remainingMs: 0, isUrgentRed: true, unit: 'days', displayCount: 0 };
  }

  const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
  const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

  // If 5 hours or less remaining, trigger red state & countdown in hours
  if (remainingHours <= 5) {
    return {
      days: remainingDays,
      remainingHours,
      remainingMs,
      isUrgentRed: true,
      unit: 'hours',
      displayCount: remainingHours
    };
  }

  // More than 5 hours left
  return {
    days: remainingDays,
    remainingHours,
    remainingMs,
    isUrgentRed: false,
    unit: 'days',
    displayCount: remainingDays
  };
};

export const isTrialActive = (garage: any): boolean => {
  return garage.isTrial === true && !isSubscriptionExpired(garage);
};

export const getEffectiveDailyCapacity = (garage: any): number => {
  if (!garage) return 0;
  
  // 1. Trial garages are unlimited
  if (garage.isTrial === true) return 0;

  // 2. Check package name or activePackageName
  const pkgName = String(garage.activePackageName || garage.packageName || garage.lastPackageName || '');
  const isExplicitlyUnlimited = 
    pkgName.includes('مفتوح') || 
    pkgName.includes('غير محدود') || 
    pkgName.includes('غير محدودة') || 
    pkgName.includes('بدون حدود') || 
    pkgName.includes('سعة مفتوحة') ||
    pkgName.includes('تجريبي');

  if (isExplicitlyUnlimited) {
    return 0; // Unlimited capacity
  }

  // 3. Explicit dailyCapacity > 0 stored on garage
  if (typeof garage.dailyCapacity === 'number' && garage.dailyCapacity > 0) {
    return garage.dailyCapacity;
  }

  // 4. Check carsCount / vehiclesCount if set as capacity (not duration days)
  if (
    typeof garage.carsCount === 'number' && 
    garage.carsCount > 0 && 
    garage.carsCount <= 1000 && 
    ![7, 15, 30].includes(garage.carsCount)
  ) {
    return garage.carsCount;
  }
  if (
    typeof garage.vehiclesCount === 'number' && 
    garage.vehiclesCount > 0 && 
    garage.vehiclesCount <= 1000 && 
    ![7, 15, 30].includes(garage.vehiclesCount)
  ) {
    return garage.vehiclesCount;
  }

  // 5. Try parsing capacity from package name (e.g. "40 سيارة")
  const match = pkgName.match(/(\d+)\s*سيارة/);
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10);
    if (parsed > 0 && parsed <= 1000) return parsed;
  }

  // 6. If dailyCapacity === 0 and package name was explicitly unlimited
  if (garage.dailyCapacity === 0 && (pkgName.includes('مفتوح') || pkgName.includes('غير محدود'))) {
    return 0;
  }

  // 7. Fallback for non-trial subscriptions without explicit capacity: default limited capacity is 40
  return 40;
};

export const isUnlimitedCapacity = (garage: any): boolean => {
  return getEffectiveDailyCapacity(garage) <= 0;
};

export const calculateCapacityUsed = (garage: any): { used: number; limit: number; isUnlimited: boolean } => {
  const today = getCairoDateKey();
  const isToday = garage?.lastTransactionDate === today;
  const used = isToday ? (garage?.todayCount ?? garage?.carsInside ?? 0) : (garage?.todayCount === undefined && typeof garage?.carsInside === 'number' ? garage.carsInside : 0);
  const limit = getEffectiveDailyCapacity(garage);
  return {
    used,
    limit,
    isUnlimited: limit <= 0
  };
};
