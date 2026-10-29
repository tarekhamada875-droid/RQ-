import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  subscribeToGarageRechargeLogs: vi.fn(),
}));

const billingMocks = vi.hoisted(() => ({
  getGarageCreditLedger: vi.fn(),
}));

vi.mock('../../services', () => ({
  firestoreService: serviceMocks,
}));

vi.mock('../../services/adminBillingService', () => ({
  adminBillingService: billingMocks,
}));

import { RechargeHistoryView } from './RechargeHistoryView';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RechargeHistoryView credit grants', () => {
  it('renders only admin credit grants from the scoped ledger', async () => {
    billingMocks.getGarageCreditLedger.mockResolvedValue([
      { id: 'grant-1', kind: 'paid_grant', amount: 100, balanceAfter: 100, totalBalanceAfter: 474, occurredAt: new Date('2026-10-20T16:45:00.000Z') },
      { id: 'debit-1', kind: 'regular_entry_debit', amount: 1, balanceAfter: 473, occurredAt: new Date('2026-10-20T16:46:00.000Z') },
      { id: 'referral-1', kind: 'referral_award', amount: 20, balanceAfter: 493, occurredAt: new Date('2026-10-19T16:45:00.000Z') },
    ]);

    render(
      <RechargeHistoryView
        garage={{ id: 'garage-recharge-test', dailyCapacity: 20, billingModel: 'prepaid_credits', credits: 15 } as any}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('شحن رصيد')).toBeTruthy();
    expect(screen.getByText('+١٠٠ رصيد')).toBeTruthy();
    expect(screen.getByText('٤٧٤')).toBeTruthy();
    expect(screen.queryByText(/خصم|هدية/)).toBeNull();
    expect(serviceMocks.subscribeToGarageRechargeLogs).not.toHaveBeenCalled();
    expect(billingMocks.getGarageCreditLedger).toHaveBeenCalledWith('garage-recharge-test');
  });
});
