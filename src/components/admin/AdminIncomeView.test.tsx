import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminIncomeView } from './AdminIncomeView';

const { getIncomeSummary, getIncomeHistoryPage } = vi.hoisted(() => ({
  getIncomeSummary: vi.fn(),
  getIncomeHistoryPage: vi.fn(),
}));

vi.mock('../../services/adminIncomeService', () => ({
  adminIncomeService: { getIncomeSummary, getIncomeHistoryPage },
}));

const row = (overrides: Record<string, unknown>) => ({
  id: 'row-1',
  garageId: 'g1',
  garageName: 'جراج النور',
  amount: 100,
  paymentAmountEgp: 1000,
  balanceAfter: 160,
  occurredAt: '2026-11-20T10:00:00.000Z',
  reason: 'دفعة نقدية',
  source: 'admin_entered_grant',
  ...overrides,
});

describe('AdminIncomeView — admin income page (الدخل)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getIncomeSummary.mockResolvedValue({ totalIncomeEgp: 1234, recounted: false });
    getIncomeHistoryPage.mockResolvedValue({ rows: [], hasMore: false, nextCursor: null });
  });

  it('shows the lifetime total in Arabic numerals', async () => {
    render(<AdminIncomeView onBack={vi.fn()} />);

    expect(await screen.findByText('إجمالي الدخل')).toBeInTheDocument();
    const expected = (1234).toLocaleString('ar-EG');
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
    expect(screen.getByText('ج.م')).toBeInTheDocument();
  });

  it('lists income rows with garage name, source chip, and EGP amount', async () => {
    getIncomeHistoryPage.mockResolvedValue({
      rows: [
        row({ id: 'r1', source: 'credit_request_approval', paymentAmountEgp: 1000 }),
        row({ id: 'r2', garageName: 'جراج المستقبل', source: 'admin_entered_grant', paymentAmountEgp: 500 })
      ],
      hasMore: false,
      nextCursor: null
    });
    render(<AdminIncomeView onBack={vi.fn()} />);

    expect(await screen.findByText('جراج النور')).toBeInTheDocument();
    expect(screen.getByText('جراج المستقبل')).toBeInTheDocument();
    expect(screen.getByText('طلب مندوب')).toBeInTheDocument();
    expect(screen.getByText('إضافة يدوية')).toBeInTheDocument();
    const expectedEgp = (1000).toLocaleString('ar-EG');
    expect(screen.getByText(new RegExp(`\\+${expectedEgp}`))).toBeInTheDocument();
    expect(screen.getByText('سجل الدخل')).toBeInTheDocument();
  });

  it('shows the empty state when no income rows exist yet', async () => {
    render(<AdminIncomeView onBack={vi.fn()} />);

    expect(await screen.findByText('لسه مفيش دخل مسجل.')).toBeInTheDocument();
    expect(screen.queryByText('تحميل المزيد')).not.toBeInTheDocument();
  });

  it('appends the next page on تحميل المزيد and hides the button on the last page', async () => {
    getIncomeHistoryPage
      .mockResolvedValueOnce({
        rows: [row({ id: 'r1', garageName: 'جراج أول' })],
        hasMore: true,
        nextCursor: 'CUR1'
      })
      .mockResolvedValueOnce({
        rows: [row({ id: 'r2', garageName: 'جراج ثاني' })],
        hasMore: false,
        nextCursor: null
      });
    render(<AdminIncomeView onBack={vi.fn()} />);

    expect(await screen.findByText('جراج أول')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تحميل المزيد' }));

    await waitFor(() => {
      expect(getIncomeHistoryPage).toHaveBeenLastCalledWith('CUR1');
    });
    expect(await screen.findByText('جراج ثاني')).toBeInTheDocument();
    expect(screen.getByText('جراج أول')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'تحميل المزيد' })).not.toBeInTheDocument();
    });
  });

  it('returns to the settings catalog on back', async () => {
    const onBack = vi.fn();
    render(<AdminIncomeView onBack={onBack} />);

    fireEvent.click(await screen.findByRole('button', { name: 'الرجوع' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the summary load fails', async () => {
    getIncomeSummary.mockRejectedValue(new Error('boom'));
    render(<AdminIncomeView onBack={vi.fn()} />);

    expect(await screen.findByText('مش قادرين نجيب إجمالي الدخل دلوقتي.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    await waitFor(() => {
      expect(getIncomeSummary).toHaveBeenCalledTimes(2);
    });
  });
});
