/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UnlimitedTierType = 'daily' | 'biweekly' | 'monthly';

export interface UnlimitedFairUse {
  isActive: boolean;
  tierType: UnlimitedTierType;
  cycleCarsCount: number;
  currentAllowance: number;
  maxAllowance: number;
  stepAmount: number;
  threshold: number;
  extensionsCount: number;
  isNearMaxLimit?: boolean;
  isMaxLimitReached?: boolean;
  lastExtendedAt?: any;
}

export interface FairUseTierConfig {
  tierType: UnlimitedTierType;
  initialAllowance: number;
  stepAmount: number;
  maxAllowance: number;
  threshold: number;
}

export const FAIR_USE_CONFIGS: Record<UnlimitedTierType, FairUseTierConfig> = {
  daily: {
    tierType: 'daily',
    initialAllowance: 200,
    stepAmount: 200,
    maxAllowance: 400,
    threshold: 20
  },
  biweekly: {
    tierType: 'biweekly',
    initialAllowance: 500,
    stepAmount: 500,
    maxAllowance: 2500,
    threshold: 50
  },
  monthly: {
    tierType: 'monthly',
    initialAllowance: 1000,
    stepAmount: 1000,
    maxAllowance: 5000,
    threshold: 100
  }
};

export const resolveTierType = (durationDays: number = 30, packageName: string = ''): UnlimitedTierType => {
  const normPkg = (packageName || '').trim().toLowerCase();
  if (normPkg.includes('يومي') || normPkg.includes('يوم واحد') || normPkg.includes('daily') || durationDays <= 1) {
    return 'daily';
  }
  if (normPkg.includes('15') || normPkg.includes('نصف') || normPkg.includes('biweekly') || durationDays <= 15) {
    return 'biweekly';
  }
  return 'monthly';
};

export const getFairUseConfig = (durationDays: number = 30, packageName: string = ''): FairUseTierConfig => {
  const tierType = resolveTierType(durationDays, packageName);
  return FAIR_USE_CONFIGS[tierType];
};

export const initializeFairUse = (durationDays: number = 30, packageName: string = ''): UnlimitedFairUse => {
  const config = getFairUseConfig(durationDays, packageName);
  return {
    isActive: true,
    tierType: config.tierType,
    cycleCarsCount: 0,
    currentAllowance: config.initialAllowance,
    maxAllowance: config.maxAllowance,
    stepAmount: config.stepAmount,
    threshold: config.threshold,
    extensionsCount: 0,
    isNearMaxLimit: false,
    isMaxLimitReached: false
  };
};

export interface FairUseEvaluationResult {
  allowed: boolean;
  updatedFairUse: UnlimitedFairUse;
  autoExtended: boolean;
  reason?: 'FAIR_USE_LIMIT_REACHED';
}

export const evaluateFairUseCheckIn = (
  currentFairUse: Partial<UnlimitedFairUse> | null | undefined,
  durationDays: number = 30,
  packageName: string = ''
): FairUseEvaluationResult => {
  const config = getFairUseConfig(durationDays, packageName);

  // Fallback / default initialization if missing
  const fairUse: UnlimitedFairUse = {
    isActive: true,
    tierType: currentFairUse?.tierType || config.tierType,
    cycleCarsCount: Math.max(0, Number(currentFairUse?.cycleCarsCount || 0)),
    currentAllowance: Math.max(config.initialAllowance, Number(currentFairUse?.currentAllowance || config.initialAllowance)),
    maxAllowance: Math.max(config.maxAllowance, Number(currentFairUse?.maxAllowance || config.maxAllowance)),
    stepAmount: Number(currentFairUse?.stepAmount || config.stepAmount),
    threshold: Number(currentFairUse?.threshold || config.threshold),
    extensionsCount: Math.max(0, Number(currentFairUse?.extensionsCount || 0)),
    isNearMaxLimit: Boolean(currentFairUse?.isNearMaxLimit),
    isMaxLimitReached: Boolean(currentFairUse?.isMaxLimitReached),
    ...(currentFairUse?.lastExtendedAt !== undefined ? { lastExtendedAt: currentFairUse.lastExtendedAt } : {})
  };

  const nextCount = fairUse.cycleCarsCount + 1;

  // 1. Hard Ceiling Check: Cannot exceed maxAllowance
  if (nextCount > fairUse.maxAllowance) {
    return {
      allowed: false,
      autoExtended: false,
      reason: 'FAIR_USE_LIMIT_REACHED',
      updatedFairUse: {
        ...fairUse,
        isMaxLimitReached: true,
        isNearMaxLimit: true
      }
    };
  }

  let autoExtended = false;
  let newAllowance = fairUse.currentAllowance;
  let extensionsCount = fairUse.extensionsCount;

  // 2. Auto-Extension Check:
  // If remaining cars in current tier allowance is within threshold AND current allowance is below max allowance
  const remainingInCurrentTier = newAllowance - nextCount;
  if (remainingInCurrentTier <= fairUse.threshold && newAllowance < fairUse.maxAllowance) {
    newAllowance = Math.min(fairUse.maxAllowance, newAllowance + fairUse.stepAmount);
    extensionsCount += 1;
    autoExtended = true;
  }

  // 3. Near Max Limit Flag (for Admin Alert Badge):
  // When remaining cars to the ABSOLUTE maximum ceiling is within threshold
  const remainingToMax = fairUse.maxAllowance - nextCount;
  const isNearMaxLimit = remainingToMax <= fairUse.threshold;
  const isMaxLimitReached = nextCount >= fairUse.maxAllowance;

  const updatedFairUse: UnlimitedFairUse = {
    ...fairUse,
    cycleCarsCount: nextCount,
    currentAllowance: newAllowance,
    extensionsCount,
    isNearMaxLimit,
    isMaxLimitReached,
  };
  if (autoExtended) {
    updatedFairUse.lastExtendedAt = new Date();
  } else if (updatedFairUse.lastExtendedAt === undefined) {
    delete updatedFairUse.lastExtendedAt;
  }

  return {
    allowed: true,
    autoExtended,
    updatedFairUse
  };
};

export const manualAdminExtendFairUse = (
  currentFairUse: UnlimitedFairUse,
  extraCars: number = 0
): UnlimitedFairUse => {
  const step = extraCars > 0 ? extraCars : currentFairUse.stepAmount;
  const newMax = currentFairUse.maxAllowance + step;
  const newCurrent = Math.max(currentFairUse.currentAllowance, currentFairUse.cycleCarsCount) + step;

  const updatedFairUse: UnlimitedFairUse = {
    ...currentFairUse,
    maxAllowance: newMax,
    currentAllowance: newCurrent,
    extensionsCount: (currentFairUse.extensionsCount || 0) + 1,
    isMaxLimitReached: false,
    isNearMaxLimit: false,
    lastExtendedAt: new Date()
  };
  return updatedFairUse;
};
