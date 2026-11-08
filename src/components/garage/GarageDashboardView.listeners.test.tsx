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
  subscribeToCreditGrantLogs: vi.fn(),
  subscribeToSubscribers: vi.fn(),
  getLatestCreditGrantLog: vi.fn(),
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
  GarageDashboardHeaderAndDrawer: ({ onNavigateOverlay, expiringSubscribersCount, hasNewCreditGrant }: any) => (
    <header>
      <output data-testid="expiring-subscriber-badge">{expiringSubscribersCount}</output>
      <output data-testid="recharge-badge">{String(hasNewCreditGrant)}</output>
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
vi.mock('./CreditGrantHistoryView', () => ({
  CreditGrantHistoryView: ({ sharedLogs, onClose }: any) => (
    <section data-testid="credit-grant-history-overlay">
      <output data-testid="overlay-recharge-ids">{sharedLogs.map((log: any) => log.id).join(',')}</output>
      <button type="button" onClick={onClose}>Close history</button>
    </section>
  ),
}));
vi.mock('./modals/CreditGrantNotificationModal', () => ({ CreditGrantNotificationModal: () => null }));
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
  serviceMocks.subscribeToCreditGrantLogs.mockImplementation((_garageId, callback, limit) => {
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
  serviceMocks.getLatestCreditGrantLog.mockResolvedValue(null);
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

describe('GarageDashboardView listeners under Option 2 (badge reads garage.lastCreditGrantAt, modal-only credit-grant listener)', () => {
  it('does NOT subscribe to credit-grant logs while the history modal is closed; opens a limit-50 listener on demand and tears it down on close', async () => {
    const { unmount } = render(<DashboardHarness />);

    // No credit-grant listener at all while the modal is closed — the badge
    // reads garage.lastCreditGrantAt via the existing garage-doc subscription.
    await waitFor(() => {
      expect(subscriberListeners).toHaveLength(1);
    });
    expect(rechargeListeners).toHaveLength(0);
    expect(activeCount(subscriberListeners)).toBe(1);

    // Subscriber badge still works (separate listener, unchanged).
    const subscriber = {
      id: 'expiring-subscriber',
      ownerName: 'Soon Expiring',
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
    act(() => {
      subscriberListeners[0].callback([subscriber], { lastDoc: { id: 'cursor-50' }, hasMore: true });
    });
    expect(screen.getByTestId('expiring-subscriber-badge')).toHaveTextContent('1');

    // Open subscribers overlay — does not open a credit-grant listener.
    fireEvent.click(screen.getByRole('button', { name: 'Open subscribers' }));
    expect(screen.getByTestId('overlay-subscriber-ids')).toHaveTextContent('expiring-subscriber');
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close subscribers' }));
    expect(activeCount(subscriberListeners)).toBe(1);
    expect(serviceMocks.subscribeToSubscribers).toHaveBeenCalledTimes(1);

    // Open the credit-grant history overlay — limit-50 listener starts now.
    fireEvent.click(screen.getByRole('button', { name: 'Open recharge history' }));
    await waitFor(() => expect(rechargeListeners).toHaveLength(1));
    expect(rechargeListeners[0].limit).toBe(50);
    expect(activeCount(rechargeListeners)).toBe(1);

    const recharge = {
      id: 'shared-recharge',
      garageId: 'garage-listener-integration',
      actionType: 'recharge',
      timestamp: new Date(),
      amount: 100,
      details: { packageName: 'Shared package' },
    };
    act(() => rechargeListeners[0].callback([recharge]));
    expect(screen.getByTestId('overlay-recharge-ids')).toHaveTextContent('shared-recharge');

    // Close the history overlay — listener tears down.
    fireEvent.click(screen.getByRole('button', { name: 'Close history' }));
    await waitFor(() => expect(activeCount(rechargeListeners)).toBe(0));
    expect(rechargeListeners[0].unsubscribe).toHaveBeenCalledOnce();

    // Reopen — fresh listener.
    fireEvent.click(screen.getByRole('button', { name: 'Open recharge history' }));
    await waitFor(() => expect(rechargeListeners).toHaveLength(2));
    expect(activeCount(rechargeListeners)).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close history' }));
    await waitFor(() => expect(activeCount(rechargeListeners)).toBe(0));

    unmount();
    expect(activeCount(rechargeListeners)).toBe(0);
    expect(activeCount(subscriberListeners)).toBe(0);
  });

  it('counts only subscribers expiring today through three days from now using the Cairo business day', async () => {
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

  it('fires the badge when garage.lastCreditGrantAt is recent and unacknowledged, fetches log details on-demand, and expires after 15 minutes', async () => {
    vi.useFakeTimers();
    try {
      // Grant happened 5 minutes ago — well inside the 15-minute window,
      // so advancing 60 seconds later must NOT dismiss the badge.
      const grantTime = new Date('2026-10-19T12:00:00.000Z');
      const initialNow = new Date('2026-10-19T12:05:00.000Z');
      vi.setSystemTime(initialNow);

      // Badge trigger: garage doc carries lastCreditGrantAt (server-stamped).
      const garage = makeGarage({ lastCreditGrantAt: grantTime });
      const recharge = {
        id: 'expiring-recharge',
        garageId: garage.id,
        actionType: 'credit_grant',
        timestamp: grantTime,
        amount: 100,
        details: { packageName: 'Expiring package' },
      };
      // On-demand fetch returns the latest credit-grant activity_log doc.
      serviceMocks.getLatestCreditGrantLog.mockResolvedValue(recharge);

      render(<DashboardHarness garage={garage} />);

      // Badge fires synchronously off lastCreditGrantAt comparison (effect
      // runs on mount; no waitFor needed since the state is set during
      // the initial render's effect flush).
      expect(screen.getByTestId('recharge-badge')).toHaveTextContent('true');

      // The credit-grant listener is NOT running (modal is closed) — the
      // badge source is the garage doc, not the activity_logs subcollection.
      expect(rechargeListeners).toHaveLength(0);

      // Drain the on-demand log-detail fetch microtask queue and assert it
      // fired exactly once with the correct garageId. Wrapped in act() so
      // the resulting state update (setLatestRechargeLog) is flushed
      // synchronously instead of leaking into the next assertion.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(serviceMocks.getLatestCreditGrantLog).toHaveBeenCalledTimes(1);
      expect(serviceMocks.getLatestCreditGrantLog).toHaveBeenCalledWith(garage.id);

      // Advance 60 seconds — still within the 15-minute window (5+1=6min),
      // badge stays on.
      act(() => vi.advanceTimersByTime(60 * 1000));
      expect(screen.getByTestId('recharge-badge')).toHaveTextContent('true');

      // Advance past the remaining ~9 minutes (to 15:00 total) — badge
      // auto-clears via the expiry timer.
      act(() => vi.advanceTimersByTime(10 * 60 * 1000));
      expect(screen.getByTestId('recharge-badge')).toHaveTextContent('false');
    } finally {
      vi.useRealTimers();
    }
  });
});
