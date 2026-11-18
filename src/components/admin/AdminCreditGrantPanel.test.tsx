import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminCreditGrantPanel } from './AdminCreditGrantPanel';

// Per-garage pricing (owner decision 2026-11-18): the admin types the EGP
// collected from the garage, and the server converts it with THIS garage's
// price. The panel must (a) preview the real conversion live, (b) never
// imply 1:1 for pinned garages, and (c) show the server's real granted
// credits + balance in the success message instead of echoing the typed
// number (they differ whenever the price ≠ 1).

vi.mock('../../services', () => ({
  adminService: {
    adminGrantGarageCredits: vi.fn(),
    adminCorrectGarageCredits: vi.fn(),
    setGarageCreditRate: vi.fn(),
  },
}));

vi.mock('../../api/apiClient', () => ({
  apiFetch: vi.fn(),
}));

import { adminService } from '../../services';
import { apiFetch } from '../../api/apiClient';

const grantMock = vi.mocked(adminService.adminGrantGarageCredits);

const garageBase: any = {
  id: 'g-1',
  name: 'جراح العبئة 11',
  billingModel: 'prepaid_credits',
  credits: 100,
};

const GRANT_LABEL = 'المبلغ المحصل من الجراج (50 إلى 2,000 ج.م)';

const typeAmount = async (value: string) => {
  const input = screen.getByLabelText(GRANT_LABEL);
  fireEvent.input(input, { target: { value } });
  fireEvent.blur(input);
  return input;
};

const findParagraph = (substring: string) =>
  screen.findByText((_, element) =>
    element?.tagName === 'P' && (element.textContent?.includes(substring) ?? false),
  );

beforeEach(() => {
  grantMock.mockReset();
  (apiFetch as any).mockReset();
  (apiFetch as any).mockResolvedValue({ success: true, config: { creditRate: 1 } });
});

describe('AdminCreditGrantPanel per-garage pricing wiring', () => {
  it('previews the real conversion for a pinned garage and reports the server truth', async () => {
    grantMock.mockResolvedValue({ garageId: 'g-1', amount: 133, paymentAmountEgp: 100, balance: 233, entryId: 'entry-1' });
    render(<AdminCreditGrantPanel garage={{ ...garageBase, creditRateOverride: 1 / 0.75 }} />);

    await typeAmount('100');

    // Live preview: 100 ج.م buys 133 credits at 0.75 ج.م/رصيد, marked as a
    // special price for this garage.
    expect(await screen.findByText('133')).toBeInTheDocument();
    expect(screen.getByText(/سعر خاص 0\.75 ج\.م\/رصيد/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إضافة رصيد' }));

    // Success states the REAL granted credits and new balance from the
    // server response — not the typed number.
    const success = await findParagraph('رصيد تمت إضافته مقابل 100 ج.م');
    expect(success.textContent).toContain('133');
    expect(success.textContent).toContain('233');
    expect(grantMock).toHaveBeenCalledWith('g-1', expect.objectContaining({
      amount: 100,
      paymentAmountEgp: 100,
      paymentConfirmed: true,
    }));
  });

  it('previews 1:1 only when the effective price is really 1', async () => {
    grantMock.mockResolvedValue({ garageId: 'g-1', amount: 100, paymentAmountEgp: 100, balance: 200, entryId: 'entry-2' });
    render(<AdminCreditGrantPanel garage={garageBase} />);

    await typeAmount('100');

    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.queryByText(/سعر خاص/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إضافة رصيد' }));
    const success = await findParagraph('رصيد تمت إضافته مقابل 100 ج.م');
    expect(success.textContent).toContain('الرصيد الحالي: 200');
  });

  it('shows the granted credits from the server even when they differ from the typed amount', async () => {
    grantMock.mockResolvedValue({ garageId: 'g-1', amount: 150, paymentAmountEgp: 100, balance: 250, entryId: 'entry-3' });
    render(<AdminCreditGrantPanel garage={garageBase} />);

    await typeAmount('100');
    fireEvent.click(screen.getByRole('button', { name: 'إضافة رصيد' }));

    const success = await findParagraph('رصيد تمت إضافته مقابل 100 ج.م');
    expect(success.textContent).toContain('150');
    expect(success.textContent).toContain('250');
  });

  it('uses the EGP validation wording for grants and keeps corrections unchanged', async () => {
    render(<AdminCreditGrantPanel garage={garageBase} />);

    await typeAmount('10');
    fireEvent.click(screen.getByRole('button', { name: 'إضافة رصيد' }));
    expect(await screen.findByText('أدخل مبلغًا صحيحًا من 50 إلى 2,000 ج.م.')).toBeInTheDocument();
    expect(grantMock).not.toHaveBeenCalled();

    // Correction mode keeps its own credit-denominated label — no rate
    // conversion applies to deductions.
    fireEvent.click(screen.getByRole('tab', { name: /خصم رصيد/ }));
    expect(screen.getByLabelText('قيمة الخصم (سالبة، حتى -100,000)')).toBeInTheDocument();
    expect(screen.queryByText(/ج\.م ←/)).not.toBeInTheDocument();
  });
});
