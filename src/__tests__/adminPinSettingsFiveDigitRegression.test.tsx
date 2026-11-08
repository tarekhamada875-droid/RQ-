import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminPinSettingsView } from '../components/admin/AdminPinSettingsView';

const { apiFetch, isPinTaken, updateAdminPin } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  isPinTaken: vi.fn(),
  updateAdminPin: vi.fn(),
}));

vi.mock('../api/apiClient', () => ({ apiFetch }));
vi.mock('../services', () => { const _svc = { isPinTaken, updateAdminPin }; return { firestoreService: _svc, garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });

// PERF (audit 2026-11-08): FastInput uses a native 'input' event listener,
// not React's onChange. fireEvent.change fires a React synthetic 'change'
// event which FastInput doesn't see. To fill a FastInput in tests, we must
// set the DOM value directly and dispatch a native 'input' event, then
// blur to trigger onCommit.
const fillFastInput = (input: HTMLElement, value: string) => {
  const el = input as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  fireEvent.blur(el);
};

describe('AdminPinSettingsView five-digit PIN change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValue({ valid: true });
    isPinTaken.mockResolvedValue({ taken: false });
    updateAdminPin.mockResolvedValue(undefined);
  });

  it('allows a five-digit new PIN without browser minlength validation blocking submission', async () => {
    render(<AdminPinSettingsView onCancel={vi.fn()} />);

    fillFastInput(screen.getByLabelText('رمز الدخول الحالي'), '88899');
    fireEvent.click(screen.getByRole('button', { name: /تأكيد ودخول/ }));

    const newPin = await screen.findByLabelText('رمز الدخول الجديد');
    expect(newPin).toHaveAttribute('minLength', '5');
    expect(newPin).toHaveAttribute('maxLength', '5');
    expect(screen.getByText('أدخل رمز دخول جديداً (5 أرقام)')).toBeInTheDocument();

    fillFastInput(newPin, '12345');
    fireEvent.click(screen.getByRole('button', { name: /حفظ رمز الدخول/ }));

    await waitFor(() => {
      expect(updateAdminPin).toHaveBeenCalledWith('12345', '88899');
    });
  });
});
