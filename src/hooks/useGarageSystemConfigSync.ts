import { useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getWalletNumberUpdate } from '../utils/walletNumber';
import { useSystemConfig } from './useSystemConfig';

export type SubscriptionPriceState = {
  weekly: number;
  biweekly?: number;
  monthly: number;
  weeklyDiscount?: number;
  biweeklyDiscount?: number;
  monthlyDiscount?: number;
};

/** Keeps garage-local wallet and package-price state in sync with the shared config snapshot. */
export function useGarageSystemConfigSync(
  setWalletNumber: Dispatch<SetStateAction<string>>,
  setSubscriptionPrices: Dispatch<SetStateAction<SubscriptionPriceState>>,
): void {
  const systemConfig = useSystemConfig();

  useEffect(() => {
    if (!systemConfig) return;

    // Do not erase a valid cached wallet with an empty API/Firestore fallback.
    const nextWalletNumber = getWalletNumberUpdate(systemConfig.walletNumber);
    if (nextWalletNumber) setWalletNumber(nextWalletNumber);

    // Preserve defaults and existing values when the config document is incomplete.
    const nextPrices = systemConfig.subscriptionPrices;
    if (nextPrices && Object.keys(nextPrices).length > 0) {
      setSubscriptionPrices((current) => ({ ...current, ...nextPrices }));
    }
  }, [systemConfig, setWalletNumber, setSubscriptionPrices]);
}
