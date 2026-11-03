import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GarageInputProvider } from '../../hooks/garageInput';

vi.mock('../../hooks/vehicleOpsContext', () => ({
  VehicleOpsProvider: ({ children }: any) => children,
  useVehicleOps: () => ({
    setSelectedVehicle: vi.fn(),
    setShowCheckOutModal: vi.fn(),
    newPlateNumber: '',
    setNewPlateNumber: vi.fn(),
    handleCheckIn: vi.fn(),
    isLoading: false,
    checkoutJustSucceeded: false,
  }),
}));

const serviceMocks = vi.hoisted(() => ({
  subscribeToGarageRechargeLogs: vi.fn(),
  subscribeToSubscribers: vi.fn(),
}));

vi.mock('../../services', () => ({
  firestoreService: serviceMocks,
  garageService: serviceMocks,
  garageDeletionService: serviceMocks,
  vehicleService: serviceMocks,
  delegateService: serviceMocks,
  adminService: serviceMocks,
  authService: serviceMocks,
}));
vi.mock('../../firebase', () => ({
  auth: {
    currentUser: { uid: 'garage-owner-test' },
    onAuthStateChanged: vi.fn((callback) => {
      callback({ uid: 'garage-owner-test' });
      return vi.fn();
    }),
  },
}));
vi.mock('../../utils/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../../utils/sounds', () => ({ soundManager: { play: vi.fn() } }));
vi.mock('../../hooks/useSystemConfig', () => ({ useSystemConfig: () => ({ adminColor: '#10b981', paymentWalletNumber: '' }) }));
vi.mock('../ui/FlipNumber', () => ({ FlipNumber: () => null }));
vi.mock('./RegistrationCard', () => ({ RegistrationCard: () => null }));
vi.mock('./SmartActionPrompt', () => ({ SmartActionPrompt: () => null }));
vi.mock('./dashboard/GarageSubscriptionCard', () => ({ GarageSubscriptionCard: () => null }));
vi.mock('./dashboard/GarageActiveVehiclesList', () => ({ GarageActiveVehiclesList: () => null }));
vi.mock('./dashboard/GarageDashboardHeaderAndDrawer', () => ({
  GarageDashboardHeaderAndDrawer: ({ onNavigateOverlay, expiringSubscribersCount, hasNewRecharge }: any) => (
    <header>
      <output data-testid="expiring-subscriber-badge">{expiringSubscribersCount}</output>
      <output data-testid="recharge-badge">{String(hasNewRecharge)}</output>
      <button type="button" onClick={() => onNavigateOverlay('subscribers')}>Open subscribers</button>
      <button type="button" onClick={() => onNavigateOverlay('history')}>Open recharge history</button>
    </header>
  ),
}));
vi.mock('./SubscribersView', () => ({
  SubscribersView: ({ subscriberPage, onClose }: any) => (
    <section data-testid="subscribers-overlay">
      <output data-testid="overlay-subscriber-ids">{subscriberPage.subscribers.map((subscriber: any) => subscriber.id).join(',')}</output>
      <button type="button" onClick={onClose}>Close subscribers</button>
    </section>
  ),
}));
vi.mock('./RechargeHistoryView', () => ({
  RechargeHistoryView: ({ sharedLogs, onClose }: any) => (
    <section data-testid="recharge-history-overlay">
      <output data-testid="overlay-recharge-ids">{sharedLogs.map((log: any) => log.id).join(',')}</output>
      <button type="button" onClick={onClose}>Close history</button>
    </section>
  ),
}));
vi.mock('./modals/RechargeNotificationModal', () => ({ RechargeNotificationModal: () => null }));
vi.mock('./GarageReportsView', () => ({ GarageReportsView: () => null }));
vi.mock('../modals/AppearanceSettingsModal', () => ({ AppearanceSettingsModal: () => null }));
vi.mock('../modals/TermsAndConditionsModal', () => ({ TermsAndConditionsModal: () => null }));

import { GarageDashboardView } from './GarageDashboardView';

interface ActiveListener<T> {
  callback: T;
  limit?: number;
  active: boolean;
  unsubscribe: ReturnType<typeof vi.fn>;
}

type RechargeCallback = (logs: any[]) => void;
type SubscriberCallback = (subscribers: any[], page: any) => void;

let rechargeListeners: ActiveListener<RechargeCallback>[];
let subscriberListeners: ActiveListener<SubscriberCallback>[];

const activeCount = <T,>(listeners: ActiveListener<T>[]) => listeners.filter(({ active }) => active).length;

const makeGarage = (overrides: Record<string, unknown> = {}) => ({
  id: 'garage-listener-integration',
  name: 'Integration Garage',
  status: 'approved',
  hasMonthlySubscribers: true,
  isTrial: false,
  shimmerColor: '#ffffff',
  dailyCapacity: 50,
  carsInside: 0,
  credits: 500,
  billingModel: 'prepaid_credits',
  ...overrides,
});

const DashboardHarness = ({ garage = makeGarage() }: { garage?: any }) => {
  const [showSubscribers, setShowSubscribers] = useState(false);
  return (
    <GarageInputProvider>
    <GarageDashboardView
      garage={garage}
      currentStaff={null}
      vehicles={[]}
      todayTransactions={[]}
      closeKeyboard={vi.fn()}
      onLogout={vi.fn()}
      showToast={vi.fn()}
      staffList={[]}
      showSubscribers={showSubscribers}
      setShowSubscribers={setShowSubscribers}
    />
    </GarageInputProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  rechargeListeners = [];
  subscriberListeners = [];
  serviceMocks.subscribeToGarageRechargeLogs.mockImplementation((_garageId, callback, limit) => {
    const unsubscribe = vi.fn();
    const listener = { callback, limit, active: true, unsubscribe };
    unsubscribe.mockImplementation(() => { listener.active = false; });
    rechargeListeners.push(listener);
    return unsubscribe;
  });
  serviceMocks.subscribeToSubscribers.mockImplementation((_garageId, callback) => {
    const unsubscribe = vi.fn();
    const listener = { callback, active: true, unsubscribe };
    unsubscribe.mockImplementation(() => { listener.active = false; });
    subscriberListeners.push(listener);
    return unsubscribe;
  });
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GarageDashboardView shared garage listeners (UI-005)', () => {
  it('reuses badge snapshots in both overlays, avoids duplicate listeners on repeated open/close, and cleans up on unmount', async () => {
    const { unmount } = render(<DashboardHarness />);

    await waitFor(() => {
      expect(rechargeListeners).toHaveLength(1);
      expect(subscriberListeners).toHaveLength(1);
    });
    expect(activeCount(rechargeListeners)).toBe(1);
    expect(activeCount(subscriberListeners)).toBe(1);

    const subscriber = {
      id: 'expiring-subscriber',
      ownerName: 'Soon Expiring',
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const recharge = {
      id: 'shared-recharge',
      garageId: 'garage-listener-integration',
      actionType: 'recharge',
      timestamp: new Date(),
      amount: 100,
      details: { packageName: 'Shared package' },
    };
    act(() => {
      subscriberListeners[0].callback([subscriber], { lastDoc: { id: 'cursor-50' }, hasMore: true });
      rechargeListeners[0].callback([recharge]);
    });

    expect(screen.getByTestId('expiring-subscriber-badge')).toHaveTextContent('1');
    expect(screen.getByTestId('recharge-badge')).toHaveTextContent('true');

    fireEvent.click(screen.getByRole('button', { name: 'Open subscribers' }));
    expect(screen.getByTestId('overlay-subscriber-ids')).toHaveTextContent('expiring-subscriber');
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close subscribers' }));
    expect(activeCount(subscriberListeners)).toBe(1);
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open recharge history' }));
    await waitFor(() => expect(rechargeListeners).toHaveLength(2));
    expect(rechargeListeners[0].unsubscribe).toHaveBeenCalledOnce();
    expect(activeCount(rechargeListeners)).toBe(1);
    expect(rechargeListeners[1].limit).toBe(50);
    act(() => rechargeListeners[1].callback([recharge]));
    expect(screen.getByTestId('overlay-recharge-ids')).toHaveTextContent('shared-recharge');
    fireEvent.click(screen.getByRole('button', { name: 'Close history' }));
    await waitFor(() => expect(rechargeListeners).toHaveLength(3));
    expect(rechargeListeners[1].unsubscribe).toHaveBeenCalledOnce();
    expect(activeCount(rechargeListeners)).toBe(1);
    expect(rechargeListeners[2].limit).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open recharge history' }));
    await waitFor(() => expect(rechargeListeners).toHaveLength(4));
    expect(activeCount(rechargeListeners)).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close history' }));
    await waitFor(() => expect(rechargeListeners).toHaveLength(5));
    expect(activeCount(rechargeListeners)).toBe(1);

    unmount();
    expect(activeCount(rechargeListeners)).toBe(0);
    expect(activeCount(subscriberListeners)).toBe(0);
  });

  it('counts only subscribers expiring today through three days from now using the Cairo business day', async () => {
    // The dashboard derives "today" from the wall clock, so pin the system
    // time (Date only — real timers keep waitFor functional).
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
      render(<DashboardHarness />);

      await waitFor(() => expect(subscriberListeners).toHaveLength(1));
      act(() => subscriberListeners[0].callback([
        { id: 'expired-yesterday', endDate: '2026-10-23' },
        { id: 'expires-today', endDate: '2026-10-24' },
        { id: 'expires-in-three-days', endDate: '2026-10-27' },
        { id: 'expires-in-four-days', endDate: '2026-10-28' },
      ], { lastDoc: null, hasMore: false }));

      expect(screen.getByTestId('expiring-subscriber-badge')).toHaveTextContent('2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('expires an unacknowledged recharge notification with a targeted timer', () => {
    vi.useFakeTimers();
    try {
      const initialNow = new Date('2026-10-19T12:14:00.000Z');
      const rechargeTime = new Date('2026-10-19T12:00:00.000Z');
      const garage = makeGarage();
      vi.setSystemTime(initialNow);
      render(<DashboardHarness garage={garage} />);
      const recharge = {
        id: 'expiring-recharge',
        garageId: garage.id,
        actionType: 'recharge',
        timestamp: rechargeTime,
        amount: 100,
        details: { packageName: 'Expiring package' },
      };

      expect(rechargeListeners).toHaveLength(1);
      act(() => rechargeListeners[0].callback([recharge]));
      expect(screen.getByTestId('recharge-badge')).toHaveTextContent('true');

      act(() => vi.advanceTimersByTime(60 * 1000));
      expect(screen.getByTestId('recharge-badge')).toHaveTextContent('false');
    } finally {
      vi.useRealTimers();
    }
  });
});
