import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenerTracker } from './listenerTracker';

afterEach(() => {
  listenerTracker.reset();
  vi.restoreAllMocks();
});

describe('listener tracker telemetry', () => {
  it('records active, peak, registration, and idempotent unregistration counts', () => {
    const firstUnsubscribe = listenerTracker.register('garage/dashboard');
    const secondUnsubscribe = listenerTracker.register('garage/reports');

    expect(listenerTracker.getTelemetrySnapshot()).toEqual({
      activeListeners: 2,
      peakActiveListeners: 2,
      registrationCount: 2,
      unregistrationCount: 0,
      duplicateRegistrationCount: 0
    });

    firstUnsubscribe();
    firstUnsubscribe();
    secondUnsubscribe();

    expect(listenerTracker.getTelemetrySnapshot()).toEqual({
      activeListeners: 0,
      peakActiveListeners: 2,
      registrationCount: 2,
      unregistrationCount: 2,
      duplicateRegistrationCount: 0
    });
  });

  it('counts duplicate registrations without retaining listener keys in telemetry', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const firstUnsubscribe = listenerTracker.register('garage/dashboard');
    const secondUnsubscribe = listenerTracker.register('garage/dashboard');

    expect(listenerTracker.getTelemetrySnapshot()).toMatchObject({
      activeListeners: 2,
      peakActiveListeners: 2,
      registrationCount: 2,
      duplicateRegistrationCount: 1
    });
    expect(warning).toHaveBeenCalledOnce();

    firstUnsubscribe();
    secondUnsubscribe();
  });
});
