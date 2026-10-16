import { useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemConfig } from '../types';
import { useGarageSystemConfigSync, type SubscriptionPriceState } from './useGarageSystemConfigSync';

const serviceMock = vi.hoisted(() => {
  const callbacks: Array<(config: SystemConfig | null) => void> = [];
  const unsubscribe = vi.fn();
  const subscribeToSystemConfig = vi.fn((callback: (config: SystemConfig | null) => void) => {
    callbacks.push(callback);
    return unsubscribe;
  });
  return { callbacks, unsubscribe, subscribeToSystemConfig };
});

vi.mock('../services', () => ({
  firestoreService: {
    subscribeToSystemConfig: serviceMock.subscribeToSystemConfig,
  },
}));

const defaultPrices: SubscriptionPriceState = {
  weekly: 800,
  biweekly: 1500,
  monthly: 3000,
};

const makeConfig = (overrides: Partial<SystemConfig> = {}): SystemConfig => ({
  defaultTrialDays: 2,
  warningDaysThreshold: 3,
  monthlySubscribersSurchargePercent: 25,
  monthlySubscribersFlatFee: 250,
  ...overrides,
});

beforeEach(() => {
  serviceMock.callbacks.length = 0;
  serviceMock.subscribeToSystemConfig.mockClear();
  serviceMock.unsubscribe.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('useGarageSystemConfigSync', () => {
  it('keeps cached wallet/default prices on empty fallbacks and merges partial updates', () => {
    const { result, unmount } = renderHook(() => {
      const [walletNumber, setWalletNumber] = useState('cached-wallet');
      const [subscriptionPrices, setSubscriptionPrices] = useState(defaultPrices);
      useGarageSystemConfigSync(setWalletNumber, setSubscriptionPrices);
      return { walletNumber, subscriptionPrices };
    });

    expect(serviceMock.subscribeToSystemConfig).toHaveBeenCalledTimes(1);
    const notify = serviceMock.callbacks[0];
    expect(notify).toBeTypeOf('function');

    act(() => notify?.(makeConfig({ walletNumber: '   ', subscriptionPrices: {} })));
    expect(result.current.walletNumber).toBe('cached-wallet');
    expect(result.current.subscriptionPrices).toEqual(defaultPrices);

    act(() => notify?.(makeConfig({ walletNumber: ' 01012345678 ', subscriptionPrices: { weekly: 950 } })));
    expect(result.current.walletNumber).toBe('01012345678');
    expect(result.current.subscriptionPrices).toEqual({
      weekly: 950,
      biweekly: 1500,
      monthly: 3000,
    });

    unmount();
    expect(serviceMock.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
