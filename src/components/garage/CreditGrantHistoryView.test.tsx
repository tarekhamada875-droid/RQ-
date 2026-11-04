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

  it('shows current balance in the summary header even with no grants', async () => {
    billingMocks.getGarageCreditLedger.mockResolvedValue([]);

    render(
      <CreditGrantHistoryView
        garage={{ id: 'garage-empty', credits: 0 } as any}
        onClose={vi.fn()}
      />,
    );

    // Summary header is always rendered (anchors the page even when empty)
    expect(await screen.findByText('الرصيد الحالي')).toBeTruthy();
    expect(screen.getByText('٠')).toBeTruthy();
    // Empty-state message
    expect(screen.getByText('لسه مفيش شحن مسجل للجراج ده.')).toBeTruthy();
  });

  it('shows total recharged and grant count in summary when grants exist', async () => {
    billingMocks.getGarageCreditLedger.mockResolvedValue([
      { id: 'g1', kind: 'paid_grant', amount: 100, totalBalanceAfter: 100, occurredAt: new Date('2026-10-20T16:45:00.000Z') },
      { id: 'g2', kind: 'paid_grant', amount: 200, totalBalanceAfter: 300, occurredAt: new Date('2026-10-21T16:45:00.000Z') },
      { id: 'g3', kind: 'paid_grant', amount: 60, totalBalanceAfter: 360, occurredAt: new Date('2026-10-22T16:45:00.000Z') },
    ]);

    render(
      <CreditGrantHistoryView
        garage={{ id: 'g', credits: 250 } as any}
        onClose={vi.fn()}
      />,
    );

    // Total = 100 + 200 + 60 = 360 (matches the third grant's balance-after too)
    expect(await screen.findByText(/إجمالي الشحنات/)).toBeTruthy();
    // ٣٦٠ appears in summary total AND in the third grant's balance-after row
    expect(screen.getAllByText('٣٦٠').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('٢٥٠')).toBeTruthy(); // current balance
    // Count = 3
    expect(screen.getByText(/٣ عملية شحن/)).toBeTruthy();
  });

  it('does not render the removed "تم الشحن" badge or redundant titles', async () => {
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
    // Status badge — every row is paid_grant so it's pure noise, removed
    expect(screen.queryByText('تم الشحن')).toBeNull();
    // Card title — every row is a recharge, removed
    expect(screen.queryByText('شحن رصيد')).toBeNull();
    // Section header — the list is obviously operations, removed
    expect(screen.queryByText('عمليات الشحن')).toBeNull();
  });
});
