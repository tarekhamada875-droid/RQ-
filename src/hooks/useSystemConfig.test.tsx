import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemConfig } from '../types';
import { useSystemConfig } from './useSystemConfig';
import {
  useSystemDelegateCommissions,
  useSystemReferralFee,
  useSystemSubscribersFlatFee,
} from './useSystemSubscribersFlatFee';

const serviceMock = vi.hoisted(() => {
  const callbacks: Array<(config: any) => void> = [];
  const unsubscribe = vi.fn();
  const subscribeToSystemConfig = vi.fn((callback: (config: any) => void) => {
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

beforeEach(() => {
  serviceMock.callbacks.length = 0;
  serviceMock.subscribeToSystemConfig.mockClear();
  serviceMock.unsubscribe.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('useSystemConfig singleton', () => {
  it('shares one subscription and one snapshot update across config and fee consumers', () => {
    const { result, unmount } = renderHook(() => {
      const config = useSystemConfig();
      const subscriberFlatFee = useSystemSubscribersFlatFee();
      const referralFee = useSystemReferralFee();
      const delegateCommissions = useSystemDelegateCommissions();
      return { config, subscriberFlatFee, referralFee, delegateCommissions };
    });

    expect(serviceMock.subscribeToSystemConfig).toHaveBeenCalledTimes(1);
    expect(serviceMock.callbacks).toHaveLength(1);

    const config: SystemConfig = {
      monthlySubscribersSurchargePercent: 25,
      monthlySubscribersFlatFee: 450,
      referralFeePerRenewal: 85,
      delegatePackageCommissions: { daily: 8, weekly: 18, biweekly: 28, monthly: 48 },
    };
    const notify = serviceMock.callbacks[0];
    expect(notify).toBeTypeOf('function');
    act(() => notify?.(config));

    expect(result.current.config).toEqual(config);
    expect(result.current.subscriberFlatFee).toBe(450);
    expect(result.current.referralFee).toBe(85);
    expect(result.current.delegateCommissions).toEqual({ daily: 8, weekly: 18, biweekly: 28, monthly: 48 });

    unmount();
    expect(serviceMock.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared subscription alive until the last independent consumer unmounts', () => {
    const first = renderHook(() => useSystemConfig());
    const second = renderHook(() => useSystemConfig());

    expect(serviceMock.subscribeToSystemConfig).toHaveBeenCalledTimes(1);
    first.unmount();
    expect(serviceMock.unsubscribe).not.toHaveBeenCalled();

    second.unmount();
    expect(serviceMock.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
