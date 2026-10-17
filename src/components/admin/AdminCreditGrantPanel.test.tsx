import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';

vi.mock('../../services', () => ({ firestoreService: { getGarageCreditLedger: vi.fn(async () => []), adminGrantGarageCredits: vi.fn(async () => ({})) } }));
const legacyGarage: any = { id: 'legacy-1', name: 'Legacy', billingModel: 'subscription' };
const prepaidGarage: any = { id: 'prepaid-1', name: 'Prepaid', billingModel: 'prepaid_credits', creditBalance: { paid: 3, referral: 2 } };

describe('AdminCreditGrantPanel', () => {
  it('does not expose grants or activation controls for a legacy garage', () => {
    render(<AdminCreditGrantPanel garage={legacyGarage} packages={[]} adminLang="en" />);
    expect(screen.queryByRole('button', { name: /grant credits/i })).toBeNull();
    expect(screen.getByText(/does not enable or migrate garages/i)).toBeTruthy();
  });

  it('requires the offline-payment checkbox and accepts one manual amount or a template', async () => {
    render(<AdminCreditGrantPanel garage={prepaidGarage} packages={[]} adminLang="en" />);
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/entered credits/i), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/offline payment reference/i), { target: { value: 'receipt-1' } });
    fireEvent.change(screen.getByLabelText(/grant reason/i), { target: { value: 'Offline bank transfer' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm payment and grant credits/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
