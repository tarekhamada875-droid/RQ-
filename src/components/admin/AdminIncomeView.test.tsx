import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminIncomeView } from './AdminIncomeView';

const { getIncomeSummary, getIncomeHistoryPage } = vi.hoisted(() => ({
  getIncomeSummary: vi.fn(),
  getIncomeHistoryPage: vi.fn(),
}));

const {
  fetchAllIncomeRows,
  buildIncomeCsv,
  buildIncomeStatementHtml,
  downloadIncomeCsv,
  printHtmlDocument,
} = vi.hoisted(() => ({
  fetchAllIncomeRows: vi.fn(),
  buildIncomeCsv: vi.fn(),
  buildIncomeStatementHtml: vi.fn(),
  downloadIncomeCsv: vi.fn(),
  printHtmlDocument: vi.fn(),
}));

vi.mock('../../services/adminIncomeService', () => ({
  adminIncomeService: { getIncomeSummary, getIncomeHistoryPage },
}));

vi.mock('../../utils/incomeExport', () => ({
  INCOME_EXPORT_PAGE_SIZE: 100,
  incomeSourceLabel: (source?: string) =>
    source === 'credit_request_approval' ? 'طلب مندوب'
      : source === 'admin_entered_grant' ? 'إضافة يدوية'
        : 'شحن رصيد',
  incomeCsvFilename: () => 'سجل-الدخل-2026-11-23.csv',
  fetchAllIncomeRows,
  buildIncomeCsv,
  buildIncomeStatementHtml,
  downloadIncomeCsv,
  printHtmlDocument,
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
    fetchAllIncomeRows.mockResolvedValue({ rows: [], truncated: false });
    buildIncomeCsv.mockReturnValue('CSV');
    buildIncomeStatementHtml.mockReturnValue('<html />');
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

  it('shows the print and CSV export tools once the history is ready', async () => {
    render(<AdminIncomeView onBack={vi.fn()} />);

    expect(await screen.findByLabelText('أدوات التصدير')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'طباعة الكشف' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'تنزيل ملف CSV' })).toBeEnabled();
  });

  it('print walks the whole ledger and prints a statement carrying the lifetime total', async () => {
    fetchAllIncomeRows.mockResolvedValue({ rows: [row({})], truncated: false });
    render(<AdminIncomeView onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'طباعة الكشف' }));

    await waitFor(() => {
      expect(printHtmlDocument).toHaveBeenCalledTimes(1);
    });
    expect(fetchAllIncomeRows).toHaveBeenCalledWith(expect.any(Function));
    expect(buildIncomeStatementHtml).toHaveBeenCalledWith({
      rows: [row({})],
      lifetimeTotalEgp: 1234,
      generatedAt: expect.any(Date),
      truncated: false,
    });
    expect(downloadIncomeCsv).not.toHaveBeenCalled();
  });

  it('csv walks the ledger, downloads a dated file, and confirms with a toast', async () => {
    const showToast = vi.fn();
    fetchAllIncomeRows.mockResolvedValue({ rows: [row({}), row({ id: 'r2' })], truncated: false });
    render(<AdminIncomeView onBack={vi.fn()} showToast={showToast} />);

    fireEvent.click(await screen.findByRole('button', { name: 'تنزيل ملف CSV' }));

    await waitFor(() => {
      expect(downloadIncomeCsv).toHaveBeenCalledWith('CSV', 'سجل-الدخل-2026-11-23.csv');
    });
    expect(buildIncomeCsv).toHaveBeenCalledWith([row({}), row({ id: 'r2' })]);
    expect(printHtmlDocument).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('2 عملية'), 'success');
  });

  it('discloses a truncated export with an info toast and passes the flag to the statement', async () => {
    const showToast = vi.fn();
    fetchAllIncomeRows.mockResolvedValue({ rows: [row({}), row({ id: 'r2' })], truncated: true });
    render(<AdminIncomeView onBack={vi.fn()} showToast={showToast} />);

    fireEvent.click(await screen.findByRole('button', { name: 'طباعة الكشف' }));

    await waitFor(() => {
      expect(printHtmlDocument).toHaveBeenCalledTimes(1);
    });
    expect(buildIncomeStatementHtml).toHaveBeenCalledWith(
      expect.objectContaining({ truncated: true, rows: [row({}), row({ id: 'r2' })] })
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('أول 2 عملية بس'), 'info');
  });

  it('reports a failed export with an error toast and re-enables the buttons', async () => {
    const showToast = vi.fn();
    fetchAllIncomeRows.mockRejectedValue(new Error('boom'));
    render(<AdminIncomeView onBack={vi.fn()} showToast={showToast} />);

    fireEvent.click(await screen.findByRole('button', { name: 'تنزيل ملف CSV' }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('حصلت مشكلة'), 'error');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'تنزيل ملف CSV' })).toBeEnabled();
    });
  });

  it('disables both export buttons and shows progress while preparing', async () => {
    fetchAllIncomeRows.mockImplementationOnce(() => new Promise(() => { /* pending walk */ }));
    render(<AdminIncomeView onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'طباعة الكشف' }));

    expect(await screen.findByText('بيجهّز الكشف...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'طباعة الكشف' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'تنزيل ملف CSV' })).toBeDisabled();
  });
});
