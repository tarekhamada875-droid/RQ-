/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Owner request 2026-11-19: the garage owner-PIN edit modal must be
// connected to the PIN generator. Regression contract:
//   1. Opening the modal suggests a fresh generated 5-digit PIN — never the
//      garage's current PIN.
//   2. «توليد رمز آخر» replaces the suggestion with another 5-digit PIN that
//      never equals what is currently in the field.
//   3. Manually typed PINs are still validated at save: a PIN held by an
//      active account is refused and names the holder; a previously-used
//      (retired) PIN gets its own clear message. Nothing is saved in either
//      case (the server enforces the same rules independently).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from '../../../utils/ThemeContext';
import { ToastProvider } from '../../../hooks/toast';
import { AdminGarageDetailsView } from '../../admin/AdminGarageDetailsView';
import { authService, garageService } from '../../../services';
import type { Garage } from '../../../types';

vi.mock('../../../services', () => {
  const _svc = {
    updateGarage: vi.fn().mockResolvedValue(true),
    getGarageById: vi.fn().mockResolvedValue(null),
    getDashboardSummary: vi.fn().mockResolvedValue({ entriesToday: 0 }),
    isPinTaken: vi.fn(),
    checkPinAvailability: vi.fn(),
    subscribeToCreditGrantLogs: vi.fn(() => () => {}),
    subscribeToSubscribers: vi.fn(() => () => {}),
    subscribeToSystemConfig: vi.fn((cb) => {
      cb({ adminColor: '#10b981' });
      return () => {};
    }),
  };
  return { garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc };
});

vi.mock('../../../firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((cb) => {
      cb(null);
      return () => {};
    }),
  },
}));

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  global.IntersectionObserver = class IntersectionObserver {
    root = null;
    rootMargin = '';
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
});

const mockGarage: Garage = {
  id: 'garage_test_1',
  name: 'جراج النصر النموذجي',
  phone: '01012345678',
  pin: '12345',
  ownerPin: '12345',
  credits: 1500,
  isLocked: false,
  isSuspended: false,
  carsInside: 12,
  todayCount: 25,
  todayRevenue: 450,
  totalVehiclesOut: 320,
  totalRevenue: 6400,
  hourlyRate: 15,
  overnightRate: 40,
  hasMonthlySubscribers: true,
  lastTransactionDate: '2026-09-25',
  status: 'approved',
  createdAt: new Date(),
};

const renderView = () =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <AdminGarageDetailsView
          selectedGarageForDetails={mockGarage}
          setView={vi.fn()}
          setSelectedGarageForDetails={vi.fn()}
          setShowDeleteConfirm={vi.fn()}
          isLoading={false}
          setIsLoading={vi.fn()}
        />
      </ToastProvider>
    </ThemeProvider>,
  );

// PERF: FastInput listens to native 'input' events, not React onChange —
// set the DOM value directly, dispatch input, then blur to commit.
const fillFastInput = (el: HTMLElement, value: string) => {
  const input = el as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  fireEvent.blur(input);
};

const openPinModal = () => {
  // The accordion is closed and there is no staff section anymore, so the
  // hero PIN chip hosts the only «تعديل» button on the page.
  fireEvent.click(screen.getByText('تعديل'));
  return screen.getByPlaceholderText('••••') as HTMLInputElement;
};

describe('Owner PIN modal is connected to the PIN generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.isPinTaken).mockResolvedValue({ taken: false });
  });

  it('opens with a generated 5-digit suggestion instead of the current PIN', () => {
    renderView();
    const input = openPinModal();
    expect(input.value).toMatch(/^\d{5}$/);
    expect(input.value).not.toBe('12345');
  });

  it('«توليد رمز آخر» replaces the field with a different 5-digit PIN', () => {
    renderView();
    const input = openPinModal();
    fillFastInput(input, '99999');
    expect(input.value).toBe('99999');

    fireEvent.click(screen.getByText('توليد رمز آخر'));

    const regenerated = screen.getByPlaceholderText('••••') as HTMLInputElement;
    expect(regenerated.value).toMatch(/^\d{5}$/);
    expect(regenerated.value).not.toBe('99999');
  });

  it('refuses a PIN held by an active account and names the holder without saving', async () => {
    vi.mocked(authService.isPinTaken).mockResolvedValue({
      taken: true,
      role: 'موظف جراج',
      roleKey: 'staff',
      name: 'أحمد سيد',
    });
    renderView();
    const input = openPinModal();
    fillFastInput(input, '54321');
    fireEvent.click(screen.getByText('حفظ الرمز'));

    expect(await screen.findByText('الرمز مستخدم بالفعل لدى (أحمد سيد)')).toBeInTheDocument();
    expect(garageService.updateGarage).not.toHaveBeenCalled();
  });

  it('refuses a previously-used (retired) PIN with its own clear message', async () => {
    vi.mocked(authService.isPinTaken).mockResolvedValue({
      taken: true,
      role: 'رمز مستخدم سابقاً',
      roleKey: 'retired',
      name: 'رمز مستخدم سابقاً',
    });
    renderView();
    const input = openPinModal();
    fillFastInput(input, '54321');
    fireEvent.click(screen.getByText('حفظ الرمز'));

    expect(await screen.findByText('هذا الرمز مستخدم سابقًا ولا يمكن إعادة استخدامه. يرجى اختيار رمز آخر.')).toBeInTheDocument();
    expect(garageService.updateGarage).not.toHaveBeenCalled();
  });
});
