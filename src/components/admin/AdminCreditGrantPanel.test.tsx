import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    adminGrantGarageCredits: vi.fn(async () => ({})),
    adminCorrectGarageCredits: vi.fn(async () => ({})),
  },
}));

const legacyGarage: any = { id: 'legacy-1', name: 'Legacy', billingModel: 'subscription' };
const prepaidGarage: any = { id: 'prepaid-1', name: 'Prepaid', billingModel: 'prepaid_credits', credits: 0 };

describe('AdminCreditGrantPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not expose a credit input for a legacy garage', () => {
    render(<AdminCreditGrantPanel garage={legacyGarage} />);
    expect(screen.queryByLabelText(/الرصيد المراد إضافته/i)).toBeNull();
    expect(screen.getByText(/إضافة الرصيد متاحة للجراجات/i)).toBeTruthy();
  });

  it('shows the Arabic-only grant form without reason field or payment confirmation checkbox', () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    expect(screen.getByLabelText(/الرصيد المراد إضافته/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/أدخل قيمة الرصيد/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^إضافة رصيد$/i })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    // Reason field removed per owner request — audit reason is auto-generated.
    expect(screen.queryByLabelText(/السبب/i)).toBeNull();
    // Payment confirmation checkbox removed — admin clicking "add" IS the confirmation.
    expect(screen.queryByText(/أؤكد أن الدفع الفعلي قد تم استلامه/i)).toBeNull();
    expect(screen.getByRole('region', { name: /إدارة رصيد الجراج/ })).toBeTruthy();
  });

  it('accepts Arabic-Indic and Persian digits in the credit amount', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '١٠٠' } });
    fireEvent.click(screen.getByRole('button', { name: /^إضافة رصيد$/i }));

    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: 100,
      paymentAmountEgp: 100,
      paymentConfirmed: true,
    })));
  });

  it('reuses the same idempotency key when retrying an ambiguous failed grant', async () => {
    vi.mocked(firestoreService.adminGrantGarageCredits).mockRejectedValueOnce(new Error('NETWORK_ERROR'));
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '100' } });

    fireEvent.click(screen.getByRole('button', { name: /^إضافة رصيد$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذرت إضافة الرصيد. يرجى مراجعة البيانات والمحاولة مرة أخرى.');
    expect(screen.queryByText('NETWORK_ERROR')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^إضافة رصيد$/i }));
    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledTimes(2));

    const firstCommand = vi.mocked(firestoreService.adminGrantGarageCredits).mock.calls[0][1];
    const retryCommand = vi.mocked(firestoreService.adminGrantGarageCredits).mock.calls[1][1];
    expect(retryCommand.idempotencyKey).toBe(firstCommand.idempotencyKey);
    expect(await screen.findByRole('status')).toHaveTextContent('100 رصيد تمت إضافته.');
  });

  it('shows Arabic guidance when the server returns an English error code', async () => {
    vi.mocked(firestoreService.adminGrantGarageCredits).mockRejectedValueOnce(new Error('GARAGE_NOT_PREPAID'));
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^إضافة رصيد$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('إضافة الرصيد متاحة للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.');
    expect(screen.queryByText('GARAGE_NOT_PREPAID')).toBeNull();
  });

  it('requires a valid whole-number credit amount', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.click(screen.getByRole('button', { name: /^إضافة رصيد$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/أدخل عددًا صحيحًا من 50 إلى 2,000/);
    expect(firestoreService.adminGrantGarageCredits).not.toHaveBeenCalled();
  });

  it('submits the grant immediately with auto-generated reason and paymentConfirmed=true', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^إضافة رصيد$/i }));

    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: 100,
      paymentAmountEgp: 100,
      reason: 'إضافة رصيد 100',
      paymentConfirmed: true,
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('100 رصيد تمت إضافته.');
  });

  it('applies a negative correction in correction mode with auto-generated reason', async () => {
    render(<AdminCreditGrantPanel garage={{ ...prepaidGarage, credits: 100 }} />);
    fireEvent.click(screen.getByRole('tab', { name: /تصحيح رصيد/i }));
    fireEvent.change(screen.getByLabelText(/قيمة التصحيح/i), { target: { value: '-50' } });
    fireEvent.click(screen.getByRole('button', { name: /تطبيق التصحيح/i }));

    await waitFor(() => expect(firestoreService.adminCorrectGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: -50,
      reason: 'تصحيح رصيد -50',
    })));
    expect(await screen.findByRole('status')).toHaveTextContent(/50 رصيد تم خصمه كتصحيح/);
  });
});
