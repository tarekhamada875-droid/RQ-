import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    adminCorrectGarageCredits: vi.fn(async () => ({})),
  },
}));

const legacyGarage: any = { id: 'legacy-1', name: 'Legacy', billingModel: 'subscription' };
const prepaidGarage: any = { id: 'prepaid-1', name: 'Prepaid', billingModel: 'prepaid_credits', credits: 0 };

describe('AdminCreditGrantPanel (deduct-only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not expose a credit input for a legacy garage', () => {
    render(<AdminCreditGrantPanel garage={legacyGarage} />);
    expect(screen.queryByLabelText(/قيمة الخصم/i)).toBeNull();
    expect(screen.getByText(/تصحيح الرصيد متاح للجراجات/i)).toBeTruthy();
  });

  it('shows the deduct-only form with no grant option and no reason field', () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    expect(screen.getByLabelText(/قيمة الخصم/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/مثال: -50/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^تطبيق الخصم$/i })).toBeTruthy();
    // No grant tab / add-balance option.
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText(/إضافة رصيد/i)).toBeNull();
    // Reason field removed per owner request — audit reason is auto-generated.
    expect(screen.queryByLabelText(/السبب/i)).toBeNull();
    expect(screen.getByRole('region', { name: /خصم رصيد الجراج/ })).toBeTruthy();
  });

  it('rejects positive values — only deductions allowed', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/قيمة الخصم/i), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/أدخل قيمة خصم سالبة/);
    expect(firestoreService.adminCorrectGarageCredits).not.toHaveBeenCalled();
  });

  it('rejects zero — only deductions allowed', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/قيمة الخصم/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/أدخل قيمة خصم سالبة/);
    expect(firestoreService.adminCorrectGarageCredits).not.toHaveBeenCalled();
  });

  it('reuses the same idempotency key when retrying an ambiguous failed deduction', async () => {
    vi.mocked(firestoreService.adminCorrectGarageCredits).mockRejectedValueOnce(new Error('NETWORK_ERROR'));
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/قيمة الخصم/i), { target: { value: '-50' } });

    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تطبيق التصحيح. يرجى مراجعة البيانات والمحاولة مرة أخرى.');
    expect(screen.queryByText('NETWORK_ERROR')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));
    await waitFor(() => expect(firestoreService.adminCorrectGarageCredits).toHaveBeenCalledTimes(2));

    const firstCommand = vi.mocked(firestoreService.adminCorrectGarageCredits).mock.calls[0][1];
    const retryCommand = vi.mocked(firestoreService.adminCorrectGarageCredits).mock.calls[1][1];
    expect(retryCommand.idempotencyKey).toBe(firstCommand.idempotencyKey);
    expect(await screen.findByRole('status')).toHaveTextContent('50 رصيد تم خصمه.');
  });

  it('shows Arabic guidance when the server returns an English error code', async () => {
    vi.mocked(firestoreService.adminCorrectGarageCredits).mockRejectedValueOnce(new Error('GARAGE_NOT_PREPAID'));
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/قيمة الخصم/i), { target: { value: '-50' } });
    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('تصحيح الرصيد متاح للجراجات التي تعمل بنظام الرصيد مسبق الدفع فقط.');
    expect(screen.queryByText('GARAGE_NOT_PREPAID')).toBeNull();
  });

  it('requires a valid whole-number deduction', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/أدخل قيمة خصم سالبة/);
    expect(firestoreService.adminCorrectGarageCredits).not.toHaveBeenCalled();
  });

  it('submits the deduction with auto-generated reason', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/قيمة الخصم/i), { target: { value: '-50' } });
    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));

    await waitFor(() => expect(firestoreService.adminCorrectGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: -50,
      reason: 'خصم رصيد -50',
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('50 رصيد تم خصمه.');
  });

  it('accepts Arabic-Indic digits in the deduction amount', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/قيمة الخصم/i), { target: { value: '-٥٠' } });
    fireEvent.click(screen.getByRole('button', { name: /^تطبيق الخصم$/i }));

    await waitFor(() => expect(firestoreService.adminCorrectGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: -50,
    })));
  });
});
