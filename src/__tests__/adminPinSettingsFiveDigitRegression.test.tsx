import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPinSettingsView } from '../components/admin/AdminPinSettingsView';

const { apiFetch, isPinTaken, updateAdminPin } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  isPinTaken: vi.fn(),
  updateAdminPin: vi.fn(),
}));

vi.mock('../api/apiClient', () => ({ apiFetch }));
vi.mock('../services', () => ({
  firestoreService: { isPinTaken, updateAdminPin },
}));

describe('AdminPinSettingsView five-digit PIN change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({ valid: true });
    isPinTaken.mockResolvedValue({ taken: false });
    updateAdminPin.mockResolvedValue(undefined);
  });

  it('allows a five-digit new PIN without browser minlength validation blocking submission', async () => {
    render(<AdminPinSettingsView onCancel={vi.fn()} t={(key) => key} />);

    fireEvent.change(screen.getByLabelText('رمز الدخول الحالي'), {
      target: { value: '88899' },
    });
    fireEvent.click(screen.getByRole('button', { name: /تأكيد ودخول/ }));

    const newPin = await screen.findByLabelText('رمز الدخول الجديد');
    expect(newPin).toHaveAttribute('minLength', '5');
    expect(newPin).toHaveAttribute('maxLength', '5');
    expect(screen.getByText('أدخل رمز دخول جديداً (5 أرقام)')).toBeInTheDocument();

    fireEvent.change(newPin, { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ رمز الدخول/ }));

    await waitFor(() => {
      expect(updateAdminPin).toHaveBeenCalledWith('12345', '88899');
    });
  });
});
