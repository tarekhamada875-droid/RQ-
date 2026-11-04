import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  subscribeToCreditGrantLogs: vi.fn(),
}));

const billingMocks = vi.hoisted(() => ({
  getGarageCreditLedger: vi.fn(),
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

vi.mock('../../services/adminBillingService', () => ({
  adminBillingService: billingMocks,
}));

import { CreditGrantHistoryView } from './CreditGrantHistoryView';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CreditGrantHistoryView credit grants', () => {
  it('renders only admin credit grants from the scoped ledger', async () => {
    billingMocks.getGarageCreditLedger.mockResolvedValue([
      { id: 'grant-1', kind: 'paid_grant', amount: 100, balanceAfter: 100, totalBalanceAfter: 474, occurredAt: new Date('2026-10-20T16:45:00.000Z') },
      { id: 'debit-1', kind: 'regular_entry_debit', amount: 1, balanceAfter: 473, occurredAt: new Date('2026-10-20T16:46:00.000Z') },
      { id: 'referral-1', kind: 'referral_award', amount: 20, balanceAfter: 493, occurredAt: new Date('2026-10-19T16:45:00.000Z') },
    ]);

    render(
      <CreditGrantHistoryView
        garage={{ id: 'garage-recharge-test', dailyCapacity: 20, billingModel: 'prepaid_credits', credits: 15 } as any}
        onClose={vi.fn()}
      />,
    );

    // Row content: amount + full "الرصيد بعد الشحن" label
    expect(await screen.findByText('+١٠٠ رصيد')).toBeTruthy();
    expect(screen.getByText(/الرصيد بعد الشحن/)).toBeTruthy();
    expect(screen.getByText('٤٧٤')).toBeTruthy();
    // Excluded kinds do not appear
    expect(screen.queryByText(/خصم|هدية/)).toBeNull();
    // Not called — page reads the ledger directly via adminBillingService
    expect(serviceMocks.subscribeToCreditGrantLogs).not.toHaveBeenCalled();
    expect(billingMocks.getGarageCreditLedger).toHaveBeenCalledWith('garage-recharge-test');
  });

  it('renders empty state when there are no grants', async () => {
    billingMocks.getGarageCreditLedger.mockResolvedValue([]);

    render(
      <CreditGrantHistoryView
        garage={{ id: 'garage-empty', credits: 0 } as any}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('لسه مفيش شحن مسجل للجراج ده.')).toBeTruthy();
    expect(screen.getByText('لما تطلب شحن رصيد، هيظهر هنا.')).toBeTruthy();
  });

  it('does not render the removed "تم الشحن" badge, card title, or section header', async () => {
    billingMocks.getGarageCreditLedger.mockResolvedValue([
      { id: 'grant-1', kind: 'paid_grant', amount: 100, totalBalanceAfter: 474, occurredAt: new Date('2026-10-20T16:45:00.000Z') },
    ]);

    render(
      <CreditGrantHistoryView
        garage={{ id: 'g', credits: 474 } as any}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText('+١٠٠ رصيد')).toBeTruthy();
    // Status badge — every row is paid_grant, status never varies, removed
    expect(screen.queryByText('تم الشحن')).toBeNull();
    // Card title — every row is a recharge, removed
    expect(screen.queryByText('شحن رصيد')).toBeNull();
    // Section header — the list is obviously operations, removed
    expect(screen.queryByText('عمليات الشحن')).toBeNull();
    // v2 summary card — duplicated dashboard data, removed in v3
    expect(screen.queryByText('الرصيد الحالي')).toBeNull();
    expect(screen.queryByText(/إجمالي الشحنات/)).toBeNull();
    expect(screen.queryByText(/عملية شحن/)).toBeNull();
  });
});
