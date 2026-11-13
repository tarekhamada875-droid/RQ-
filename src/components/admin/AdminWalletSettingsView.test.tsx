import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminWalletSettingsView } from './AdminWalletSettingsView';

const { apiFetch, updateSystemConfig } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  updateSystemConfig: vi.fn(),
}));

vi.mock('../../api/apiClient', () => ({ apiFetch }));
vi.mock('../../services', () => ({ adminService: { updateSystemConfig } }));

// FastInput uses a native 'input' event listener, not React's onChange —
// fireEvent.change is invisible to it. Set the DOM value directly, dispatch
// a native 'input' event (this is where the mask rewrites the value), then
// blur to trigger onCommit. Same recipe as
// __tests__/adminPinSettingsFiveDigitRegression.test.tsx.
const fillFastInput = (input: HTMLElement, value: string) => {
  const el = input as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fireEvent.blur(el);
};

describe('AdminWalletSettingsView digits-only wallet number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({ success: true, config: { paymentWalletNumber: '' } });
    updateSystemConfig.mockResolvedValue({ success: true });
  });

  it('strips letters and symbols live and saves only the digits', async () => {
    render(<AdminWalletSettingsView onBack={vi.fn()} />);

    const input = await screen.findByLabelText('رقم محفظة الدفع');
    fillFastInput(input, '01a0b2-34.56x78');

    // Mask rewrote the DOM value: letters, dashes and dots are gone.
    expect(input).toHaveValue('0102345678');

    fireEvent.click(screen.getByRole('button', { name: /حفظ رقم المحفظة/ }));
    await waitFor(() => {
      expect(updateSystemConfig).toHaveBeenCalledWith({ paymentWalletNumber: '0102345678' });
    });
  });

  it('converts Arabic-Indic digits to Western digits before saving', async () => {
    render(<AdminWalletSettingsView onBack={vi.fn()} />);

    const input = await screen.findByLabelText('رقم محفظة الدفع');
    fillFastInput(input, '٠١٠١٢٣٤٥٦٧٨');

    expect(input).toHaveValue('01012345678');

    fireEvent.click(screen.getByRole('button', { name: /حفظ رقم المحفظة/ }));
    await waitFor(() => {
      expect(updateSystemConfig).toHaveBeenCalledWith({ paymentWalletNumber: '01012345678' });
    });
  });
});
