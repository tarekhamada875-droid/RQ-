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
    expect(screen.queryByLabelText(/credits to add/i)).toBeNull();
    expect(screen.getByText(/only for prepaid-credit garages/i)).toBeTruthy();
  });

  it('shows only the English amount form', () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="ar" />);

    expect(screen.getByLabelText(/credits to add/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/enter credit amount/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /add credits/i })).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByLabelText(/reference|reason|confirm/i)).toBeNull();
    expect(screen.queryByText(/[\u0600-\u06FF]/)).toBeNull();
  });

  it('requires a valid whole-number credit amount', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="en" />);
    fireEvent.click(screen.getByRole('button', { name: /add credits/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/whole number between 1 and 1,000,000/i);
    expect(firestoreService.adminGrantGarageCredits).not.toHaveBeenCalled();
  });

  it('submits only the entered credit amount and generated audit metadata', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="en" />);
    fireEvent.change(screen.getByLabelText(/credits to add/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /add credits/i }));

    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: 20,
      paymentAmountEgp: 20,
      reason: 'Manual credit grant',
      paymentConfirmed: true,
    })));
    expect(await screen.findByRole('status')).toHaveTextContent('20 credits added.');
  });
});
