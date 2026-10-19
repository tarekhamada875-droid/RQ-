import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  onAnnouncementsChange: vi.fn(),
  subscribeToGarageRechargeLogs: vi.fn(),
  subscribeToSubscribers: vi.fn(),
}));

vi.mock('../../services', () => ({ firestoreService: serviceMocks }));
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
vi.mock('./modals/AnnouncementModal', () => ({ AnnouncementModal: () => null }));
vi.mock('../modals/StaffStatsModal', () => ({ StaffStatsModal: () => null }));
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
let announcementUnsubscribe: ReturnType<typeof vi.fn>;

const makeGarage = () => ({
  id: 'garage-listener-integration',
  name: 'Integration Garage',
  status: 'approved',
  hasMonthlySubscribers: true,
  isTrial: false,
  shimmerColor: '#ffffff',
  dailyCapacity: 50,
  carsInside: 0,
  balance: 500,
  balanceExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  billingModel: 'subscription',
  activePackageName: 'Monthly',
  activePackageId: 'monthly',
  lastRechargeDate: null,
});

const DashboardHarness = () => {
  const [showSubscribers, setShowSubscribers] = useState(false);
  return (
    <GarageDashboardView
      garage={makeGarage()}
      currentStaff={null}
      isInputFocused={false}
      now={new Date()}
      vehicles={[]}
      todayTransactions={[]}
      setSelectedVehicle={vi.fn()}
      setShowCheckOutModal={vi.fn()}
      closeKeyboard={vi.fn()}
      newPlateNumber=""
      setNewPlateNumber={vi.fn()}
      setIsInputFocused={vi.fn()}
      plateInputRef={useRef(null)}
      handleCheckIn={vi.fn()}
      inputRef={useRef(null)}
      onLogout={vi.fn()}
      showToast={vi.fn()}
      packages={[]}
      staffList={[]}
      showPackages={false}
      setShowPackages={vi.fn()}
      showStaffStats={false}
      setShowStaffStats={vi.fn()}
      showSubscribers={showSubscribers}
      setShowSubscribers={setShowSubscribers}
    />
  );
};

const activeCount = <T,>(listeners: ActiveListener<T>[]) => listeners.filter(({ active }) => active).length;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  rechargeListeners = [];
  subscriberListeners = [];
  announcementUnsubscribe = vi.fn();
  serviceMocks.onAnnouncementsChange.mockImplementation((callback) => {
    callback([]);
    return announcementUnsubscribe;
  });
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
    expect(announcementUnsubscribe).toHaveBeenCalledOnce();
  });
});
