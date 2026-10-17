import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    getGarageCreditLedger: vi.fn(async () => []),
    adminGrantGarageCredits: vi.fn(async () => ({})),
  },
}));
const legacyGarage: any = { id: 'legacy-1', name: 'Legacy', billingModel: 'subscription' };
const prepaidGarage: any = { id: 'prepaid-1', name: 'Prepaid', billingModel: 'prepaid_credits', creditBalance: { paid: 3, referral: 2 } };

function fillManualPayment() {
  fireEvent.change(screen.getByLabelText(/confirmed amount received/i), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText(/sender number \/ transfer reference/i), { target: { value: 'sender-1' } });
  fireEvent.change(screen.getByLabelText(/grant reason/i), { target: { value: 'Verified bank transfer' } });
}

describe('AdminCreditGrantPanel', () => {
  it('does not expose grants or activation controls for a legacy garage', () => {
    render(<AdminCreditGrantPanel garage={legacyGarage} packages={[]} adminLang="en" />);
    expect(screen.queryByRole('button', { name: /confirm transfer and add credits/i })).toBeNull();
    expect(screen.getByText(/does not enable or migrate garages/i)).toBeTruthy();
  });

  it('requires an explicit confirmation that the transfer amount was checked', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="en" />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    fillManualPayment();
    fireEvent.click(screen.getByRole('button', { name: /confirm transfer and add credits/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(firestoreService.adminGrantGarageCredits).not.toHaveBeenCalled();
  });

  it('records the actual EGP amount and grants the same number of credits', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="en" />);
    fillManualPayment();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirm transfer and add credits/i }));

    await waitFor(() => expect(firestoreService.adminGrantGarageCredits).toHaveBeenCalledWith('prepaid-1', expect.objectContaining({
      amount: 20,
      paymentAmountEgp: 20,
      paymentReference: 'sender-1',
      reason: 'Verified bank transfer',
      paymentConfirmed: true,
    })));
  });

  it('does not offer a bundle whose price differs from its credit quantity', () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} adminLang="en" packages={[
      { id: 'valid', name: '400 EGP', price: 400, creditQuantity: 400, catalogType: 'credit_bundle', isActive: true } as any,
      { id: 'mismatch', name: 'Bad bundle', price: 600, creditQuantity: 400, catalogType: 'credit_bundle', isActive: true } as any,
    ]} />);

    expect(screen.getByRole('option', { name: /400 EGP — 400 credits · 400 EGP/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Bad bundle/ })).toBeNull();
  });
});
