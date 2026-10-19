import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  subscribeToGarageRechargeLogs: vi.fn(),
}));

vi.mock('../../services', () => ({
  firestoreService: serviceMocks,
}));

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: (state: { packages: never[] }) => unknown) => selector({ packages: [] }),
}));

import { RechargeHistoryView } from './RechargeHistoryView';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RechargeHistoryView shared data', () => {
  it('renders the shared recharge snapshot without opening a duplicate listener', () => {
    const sharedLogs = [{
      id: 'shared-recharge-1',
      garageId: 'garage-recharge-test',
      staffId: 'admin',
      actionType: 'recharge',
      amount: 100,
      timestamp: new Date('2026-10-16T08:00:00.000Z'),
      details: {
        packageName: 'Shared history package',
        durationDays: 30,
        carsCount: 20,
        revenueAmount: 100,
      },
    }] as any;

    render(
      <RechargeHistoryView
        garage={{ id: 'garage-recharge-test', dailyCapacity: 20, billingModel: 'prepaid_credits', creditBalance: { paid: 12, referral: 3, trial: 0 } } as any}
        onClose={vi.fn()}
        sharedLogs={sharedLogs}
        sharedIsLoading={false}
      />,
    );

    expect(screen.getByText('Shared history package')).toBeTruthy();
    expect(screen.getByText('Remaining access credits')).toBeTruthy();
    expect(screen.getByText('15')).toBeTruthy();
    expect(serviceMocks.subscribeToGarageRechargeLogs).not.toHaveBeenCalled();
  });
});
