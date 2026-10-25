import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemConfig } from '../types';
import { useSystemConfig } from './useSystemConfig';

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
