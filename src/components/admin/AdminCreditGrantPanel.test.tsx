import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    adminGrantGarageCredits: vi.fn(async () => ({})),
  },
}));

const legacyGarage: any = { id: 'legacy-1', name: 'Legacy', billingModel: 'subscription' };
const prepaidGarage: any = { id: 'prepaid-1', name: 'Prepaid', billingModel: 'prepaid_credits' };

describe('AdminCreditGrantPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not expose a credit input for a legacy garage', () => {
    render(<AdminCreditGrantPanel garage={legacyGarage} />);
    expect(screen.queryByLabelText(/الرصيد المراد إضافته/i)).toBeNull();
    expect(screen.getByText(/إضافة الرصيد متاحة للجراجات/i)).toBeTruthy();
  });

  it('shows the Arabic-only amount form', () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);

    expect(screen.getByLabelText(/الرصيد المراد إضافته/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/أدخل قيمة الرصيد/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /إضافة رصيد/i })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByLabelText(/مرجع الدفع الفعلي/i)).toBeTruthy();
    expect(screen.getByText(/أؤكد أن الدفع الفعلي قد تم استلامه والتحقق منه/i)).toBeTruthy();
    expect(screen.getByRole('region', { name: /إضافة رصيد يدوي/ })).toBeTruthy();
  });

  it('accepts Arabic-Indic and Persian digits in the credit amount', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '٢٠' } });
    fireEvent.change(screen.getByLabelText(/مرجع الدفع الفعلي/i), { target: { value: 'receipt-arabic-123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /إضافة رصيد/i }));

    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: 20,
      paymentAmountEgp: 20,
      paymentReference: 'receipt-arabic-123',
      paymentConfirmed: true,
    })));
  });

  it('requires a valid whole-number credit amount', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.click(screen.getByRole('button', { name: /إضافة رصيد/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/أدخل عددًا صحيحًا من 1 إلى 1,000,000/);
    expect(firestoreService.adminGrantGarageCredits).not.toHaveBeenCalled();
  });

  it('requires a real payment reference and explicit payment confirmation', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /إضافة رصيد/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/مرجع الدفع الفعلي/i);
    expect(firestoreService.adminGrantGarageCredits).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/مرجع الدفع الفعلي/i), { target: { value: 'receipt-123' } });
    fireEvent.click(screen.getByRole('button', { name: /إضافة رصيد/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/تأكيد استلام الدفع والتحقق منه/i);
    expect(firestoreService.adminGrantGarageCredits).not.toHaveBeenCalled();
  });

  it('submits the entered payment reference only after confirmation', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/مرجع الدفع الفعلي/i), { target: { value: 'receipt-123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /إضافة رصيد/i }));

    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: 20,
      paymentAmountEgp: 20,
      paymentReference: 'receipt-123',
      reason: 'إضافة رصيد يدوي',
      paymentConfirmed: true,
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('20 رصيد تمت إضافته.');
  });
});
