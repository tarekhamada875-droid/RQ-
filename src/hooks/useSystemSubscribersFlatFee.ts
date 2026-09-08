import { useSystemConfig } from './useSystemConfig';

/** Subscribes to system_config/global.monthlySubscribersFlatFee (default 500). */
export function useSystemSubscribersFlatFee(): number {
  const config = useSystemConfig();
  if (config?.monthlySubscribersFlatFee !== undefined) {
    return Number(config.monthlySubscribersFlatFee) || 500;
  }
  return 500;
}

/** Subscribes to system_config/global.delegatePackageCommissions or fallback referralFeePerRenewal */
export function useSystemDelegateCommissions(): {
  daily: number;
  weekly: number;
  biweekly: number;
  monthly: number;
  [key: string]: number;
} {
  const config = useSystemConfig();
  const commissions = config?.delegatePackageCommissions;
  const fallbackMonthly = config?.referralFeePerRenewal !== undefined && !isNaN(Number(config.referralFeePerRenewal))
    ? Math.max(0, Number(config.referralFeePerRenewal))
    : 50;

  return {
    daily: commissions?.daily !== undefined && !isNaN(Number(commissions.daily)) ? Math.max(0, Number(commissions.daily)) : 5,
    weekly: commissions?.weekly !== undefined && !isNaN(Number(commissions.weekly)) ? Math.max(0, Number(commissions.weekly)) : 15,
    biweekly: commissions?.biweekly !== undefined && !isNaN(Number(commissions.biweekly)) ? Math.max(0, Number(commissions.biweekly)) : 25,
    monthly: commissions?.monthly !== undefined && !isNaN(Number(commissions.monthly)) ? Math.max(0, Number(commissions.monthly)) : fallbackMonthly,
  };
}

/** Subscribes to system_config/global.referralFeePerRenewal (default 50). */
export function useSystemReferralFee(): number {
  const config = useSystemConfig();
  if (config?.delegatePackageCommissions?.monthly !== undefined) {
    const val = Number(config.delegatePackageCommissions.monthly);
    return isNaN(val) || val < 0 ? 50 : Math.floor(val);
  }
  if (config?.referralFeePerRenewal !== undefined) {
    const val = Number(config.referralFeePerRenewal);
    return isNaN(val) || val < 0 ? 50 : Math.floor(val);
  }
  return 50;
}


