import { describe, it, expect, vi } from 'vitest';
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
  it('does not expose a credit input for a legacy garage', () => {
    render(<AdminCreditGrantPanel garage={legacyGarage} packages={[]} adminLang="en" />);
    expect(screen.queryByLabelText(/الرصيد المراد إضافته/i)).toBeNull();
    expect(screen.getByText(/إضافة الرصيد متاحة للجراجات/i)).toBeTruthy();
  });

  it('shows the Arabic-only amount form', () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="ar" />);

    expect(screen.getByLabelText(/الرصيد المراد إضافته/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/أدخل قيمة الرصيد/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /إضافة رصيد/i })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByLabelText(/reference|reason|confirm/i)).toBeNull();
    expect(screen.getByRole('region', { name: /إضافة رصيد يدوي/ })).toBeTruthy();
  });

  it('requires a valid whole-number credit amount', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="en" />);
    fireEvent.click(screen.getByRole('button', { name: /إضافة رصيد/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/أدخل عددًا صحيحًا من 1 إلى 1,000,000/);
    expect(firestoreService.adminGrantGarageCredits).not.toHaveBeenCalled();
  });

  it('submits only the entered credit amount and generated audit metadata', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="en" />);
    fireEvent.change(screen.getByLabelText(/الرصيد المراد إضافته/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /إضافة رصيد/i }));

    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: 20,
      paymentAmountEgp: 20,
      reason: 'إضافة رصيد يدوي',
      paymentConfirmed: true,
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('20 رصيد تمت إضافته.');
  });
});
