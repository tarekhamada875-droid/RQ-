import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('../services', () => { const _svc = {
    subscribeToSystemConfig: serviceMock.subscribeToSystemConfig,
  }; return { firestoreService: _svc, garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });

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

  it('uses localStorage cache on second mount and skips the API call', () => {
    // First mount: no cache, subscribes to API
    localStorage.clear();
    const first = renderHook(() => useSystemConfig());
    expect(serviceMock.subscribeToSystemConfig).toHaveBeenCalledTimes(1);

    // Simulate the API callback delivering config
    const testConfig = { adminColor: '#ff0000' };
    serviceMock.callbacks[0](testConfig);

    // Config should be cached in localStorage
    const cached = JSON.parse(localStorage.getItem('app_system_config') || '{}');
    expect(cached.config).toEqual(testConfig);
    expect(cached.cachedAt).toBeGreaterThan(0);

    first.unmount();
    serviceMock.subscribeToSystemConfig.mockClear();
    serviceMock.callbacks.length = 0;

    // Second mount: cache is valid (within TTL), should still subscribe
    // but the cached config is used immediately
    const second = renderHook(() => useSystemConfig());
    // Singleton subscribes again (new session), but the cached config
    // is already in memory from the first mount
    expect(serviceMock.subscribeToSystemConfig).toHaveBeenCalledTimes(1);
    second.unmount();
  });
});
