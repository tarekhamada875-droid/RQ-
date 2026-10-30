/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '../utils/ThemeContext';
import { AdminGarageDetailsView } from '../components/admin/AdminGarageDetailsView';
import { GarageDashboardView } from '../components/garage/GarageDashboardView';
import { LandscapeMobileView } from '../components/layout/LandscapeMobileView';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { GarageSubscriptionCard } from '../components/garage/dashboard/GarageSubscriptionCard';
import { GarageActiveVehiclesList } from '../components/garage/dashboard/GarageActiveVehiclesList';
import { AdminGarageHeroAndStats } from '../components/admin/garage-details/AdminGarageHeroAndStats';
import { AdminGarageFinancialsSection } from '../components/admin/garage-details/AdminGarageFinancialsSection';
import { firestoreService } from '../services';
import type { Garage, Staff } from '../types';

// Mock audio soundManager
vi.mock('../utils/sounds', () => ({
  soundManager: {
    play: vi.fn(),
  },
}));

// Mock firestoreService
vi.mock('../services', () => ({
  firestoreService: {
    updateGarage: vi.fn().mockResolvedValue(true),
    getGarageById: vi.fn().mockResolvedValue(null),
    getDashboardSummary: vi.fn().mockResolvedValue({ entriesToday: 0 }),
    isPinTaken: vi.fn().mockResolvedValue({ taken: false }),
    addStaff: vi.fn().mockResolvedValue({ id: 'staff_test_1' }),
    removeStaff: vi.fn().mockResolvedValue(undefined),
    subscribeToGarageRechargeLogs: vi.fn(() => () => {}),
    subscribeToSubscribers: vi.fn(() => () => {}),
    subscribeToSystemConfig: vi.fn((cb) => {
      cb({ adminColor: '#10b981' });
      return () => {};
    }),
  },
}));

// Mock firebase auth
vi.mock('../firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((cb) => {
      cb(null);
      return () => {};
    }),
  },
}));

beforeAll(() => {
  // Global mocks for DOM observers in jsdom
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  global.IntersectionObserver = class IntersectionObserver {
    root = null;
    rootMargin = '';
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
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

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
};

describe('Modularized Admin Components Integrity', () => {
  it('renders AdminGarageHeroAndStats with correct status and KPI stats', () => {
    const onToggleLock = vi.fn();
    const onOpenEditPin = vi.fn();

    renderWithTheme(
      <AdminGarageHeroAndStats
        garage={mockGarage}
        t={(key) => key}
        carsInside={12}
        dailyCount={25}
        dailyRevenue={450}
        totalCount={320}
        totalRevenue={6400}
        isUpdatingLock={false}
        onToggleLock={onToggleLock}
        onOpenEditPin={onOpenEditPin}
      />
    );

    expect(screen.getByText('جراج النصر النموذجي')).toBeDefined();
    expect(screen.getByText('01012345678')).toBeDefined();
    expect(screen.getByText('نشط')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
    expect(screen.getByText('320')).toBeDefined();

    // Trigger lock button
    const lockBtn = screen.getByText('إيقاف الخدمة فوراً');
    fireEvent.click(lockBtn);
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  it('renders current non-wallet financial settings and referral options', () => {
    const onToggleMonthly = vi.fn();
    const onRefChange = vi.fn();

    renderWithTheme(
      <AdminGarageFinancialsSection
        garage={mockGarage}
        t={(key) => key}
        onToggleMonthlySubscribers={onToggleMonthly}
        allGarages={[mockGarage]}
        onReferredByChange={onRefChange}
      />
    );

    expect(screen.getByText('خدمة المشتركين الشهريين / الإيواء')).toBeDefined();
    expect(screen.getByText('نظام مكافآت الإحالة')).toBeDefined();
    expect(screen.queryByText(/\+1 يوم مجاني/)).toBeNull();
    expect(screen.queryByText(/ج\.م ثابتة تلقائياً/)).toBeNull();
    expect(screen.queryByText('رصيد المحفظة الحالي')).toBeNull();
    expect(screen.queryByText('شحن الرصيد الآن')).toBeNull();
  });

  it('renders complete AdminGarageDetailsView orchestrator and navigates back', () => {
    const setView = vi.fn();
    const setSelected = vi.fn();
    const setShowDelete = vi.fn();

    renderWithTheme(
      <AdminGarageDetailsView
        selectedGarageForDetails={mockGarage}
        setView={setView}
        setSelectedGarageForDetails={setSelected}
        setShowDeleteConfirm={setShowDelete}
        updateGarageRate={vi.fn()}
        staffList={[]}
        setStaffList={vi.fn()}
        isLoading={false}
        setIsLoading={vi.fn()}
      />
    );

    // Garage title rendered in header and hero
    expect(screen.getAllByText('جراج النصر النموذجي').length).toBeGreaterThanOrEqual(1);

    // Back button triggers setView('admin_dashboard')
    const backBtn = screen.getByTitle('رجوع');
    fireEvent.click(backBtn);
    expect(setView).toHaveBeenCalledWith('admin_dashboard');
    expect(setSelected).toHaveBeenCalledWith(null);
  });

  it('updates the visible Staff list immediately after successful create and delete', async () => {
    vi.mocked(firestoreService.isPinTaken).mockResolvedValueOnce({ taken: false });
    vi.mocked(firestoreService.addStaff).mockResolvedValueOnce({ id: 'staff_test_refresh' });
    vi.mocked(firestoreService.removeStaff).mockResolvedValueOnce(undefined);

    const TestHarness = () => {
      const [staffList, setStaffList] = React.useState<Staff[]>([]);
      const [isLoading, setIsLoading] = React.useState(false);
      return (
        <AdminGarageDetailsView
          selectedGarageForDetails={mockGarage}
          setView={vi.fn()}
          setSelectedGarageForDetails={vi.fn()}
          setShowDeleteConfirm={vi.fn()}
          updateGarageRate={vi.fn()}
          staffList={staffList}
          setStaffList={setStaffList}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
      );
    };

    renderWithTheme(<TestHarness />);
    fireEvent.click(screen.getByText('الإعدادات والتعريفة وطاقم العمل'));
    fireEvent.click(screen.getByText('إضافة موظف'));
    fireEvent.change(screen.getByPlaceholderText('مثال: أحمد محمد'), { target: { value: 'H Staff Probe' } });
    fireEvent.click(screen.getByText('تأكيد الإضافة'));

    expect(await screen.findByText('H Staff Probe')).toBeDefined();
    expect(firestoreService.addStaff).toHaveBeenCalledWith(expect.objectContaining({
      name: 'H Staff Probe',
      garageId: mockGarage.id,
      role: 'staff',
      pin: expect.stringMatching(/^\d{5}$/),
    }));

    fireEvent.click(screen.getByTitle('حذف الموظف'));
    fireEvent.click(screen.getByText('تأكيد الحذف'));
    await waitFor(() => expect(firestoreService.removeStaff).toHaveBeenCalledWith('staff_test_refresh'));
    await waitFor(() => expect(screen.queryByText('H Staff Probe')).toBeNull());
  });
});

describe('Modularized Garage Dashboard Components Integrity', () => {
  it('does not render the retired subscription-wallet card for legacy garages', () => {
    renderWithTheme(
      <GarageSubscriptionCard
        garage={mockGarage}
      />
    );

    expect(screen.queryByText('الرصيد المتبقي')).toBeNull();
  });

  it('shows only the total credit on the dashboard card (single bucket)', () => {
    const creditGarage = { ...mockGarage, billingModel: 'prepaid_credits', credits: 15 } as any;

    renderWithTheme(<GarageSubscriptionCard garage={creditGarage} />);
    expect(screen.getByText('15')).toBeDefined();
    // The per-bucket breakdown has been retired with the single-bucket model.
    expect(screen.queryByText(/Paid: 12/)).toBeNull();
  });

  it('shows a low-credit indicator at 50 credits and a critical indicator at 10 credits', () => {
    const lowCreditGarage = { ...mockGarage, billingModel: 'prepaid_credits', credits: 50 } as any;
    const { rerender } = renderWithTheme(<GarageSubscriptionCard garage={lowCreditGarage} />);

    expect(screen.getByTestId('low-credit-indicator')).toHaveTextContent('رصيدك بيخلص');

    const criticalCreditGarage = { ...lowCreditGarage, credits: 10 } as any;
    rerender(<ThemeProvider><GarageSubscriptionCard garage={criticalCreditGarage} /></ThemeProvider>);
    expect(screen.getByTestId('low-credit-indicator')).toHaveTextContent('آخر رصيد');
  });

  it('shows staggered falling arrows across the credit card after a deduction', () => {
    const initialGarage = { ...mockGarage, billingModel: 'prepaid_credits', credits: 15 } as any;
    const deductedGarage = { ...initialGarage, credits: 13 };
    const { rerender } = renderWithTheme(<GarageSubscriptionCard garage={initialGarage} />);

    rerender(<ThemeProvider><GarageSubscriptionCard garage={deductedGarage} /></ThemeProvider>);

    expect(screen.getByTestId('credit-debit-feedback')).toBeDefined();
    const arrows = screen.getAllByTestId('credit-debit-arrow');
    expect(arrows).toHaveLength(3);
    expect(arrows[0]).toHaveClass('credit-debit-arrow-left');
    expect(arrows[1]).toHaveClass('credit-debit-arrow-center');
    expect(arrows[2]).toHaveClass('credit-debit-arrow-right');
  });

  it('renders GarageActiveVehiclesList and handles empty state', () => {
    const onClose = vi.fn();
    const onRegister = vi.fn();

    renderWithTheme(
      <GarageActiveVehiclesList
        vehicles={[]}
        visibleVehicles={[]}
        totalInsideCount={0}
        hasMoreVehicles={false}
        observerTargetRef={{ current: null }}
        scrollContainerRef={{ current: null }}
        onClose={onClose}
        onCheckOut={vi.fn()}
        onRegisterNewCar={onRegister}
      />
    );

    expect(screen.getByText('إجمالى العدد 0')).toBeDefined();
    expect(screen.getByText('لا توجد سيارات حالياً')).toBeDefined();

    const regBtn = screen.getByText('سجل دخول عربية جديدة');
    fireEvent.click(regBtn);
    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('renders GarageDashboardView orchestrator with plate registration and menu drawer triggers', () => {
    renderWithTheme(
      <GarageDashboardView
        garage={mockGarage}
        currentStaff={null}
        isInputFocused={false}
        now={new Date()}
        vehicles={[]}
        todayTransactions={[]}
        setSelectedVehicle={vi.fn()}
        setShowCheckOutModal={vi.fn()}
        closeKeyboard={vi.fn()}
        newPlateNumber=""
        setNewPlateNumber={vi.fn()}
        setIsInputFocused={vi.fn()}
        plateInputRef={{ current: null } as any}
        handleCheckIn={vi.fn()}
        inputRef={{ current: null } as any}
        onLogout={vi.fn()}
        showToast={vi.fn()}
        staffList={[]}
        showStaffStats={false}
        setShowStaffStats={vi.fn()}
        showSubscribers={false}
        setShowSubscribers={vi.fn()}
      />
    );

    // Garage name is in header
    expect(screen.getByText('جراج النصر النموذجي')).toBeDefined();
    // Brand footer was moved to the Terms page (not on dashboard anymore)
    expect(screen.queryByText('أرق لتطوير البرمجيات')).not.toBeInTheDocument();
  });

  it('hides the persistent balance card and shows the SmartActionPrompt when credits = 0', () => {
    // Depleted garage: credits = 0, prepaid_credits billing model
    const depletedGarage = { ...mockGarage, billingModel: 'prepaid_credits' as const, credits: 0 };

    renderWithTheme(
      <GarageDashboardView
        garage={depletedGarage}
        currentStaff={null}
        isInputFocused={false}
        now={new Date()}
        vehicles={[]}
        todayTransactions={[]}
        setSelectedVehicle={vi.fn()}
        setShowCheckOutModal={vi.fn()}
        closeKeyboard={vi.fn()}
        newPlateNumber=""
        setNewPlateNumber={vi.fn()}
        setIsInputFocused={vi.fn()}
        plateInputRef={{ current: null } as any}
        handleCheckIn={vi.fn()}
        inputRef={{ current: null } as any}
        onLogout={vi.fn()}
        showToast={vi.fn()}
        staffList={[]}
        showStaffStats={false}
        setShowStaffStats={vi.fn()}
        showSubscribers={false}
        setShowSubscribers={vi.fn()}
      />
    );

    // The persistent balance card (with "آخر رصيد" badge) is gone
    expect(screen.queryByTestId('low-credit-indicator')).not.toBeInTheDocument();
    // The depleted-state SmartActionPrompt owns the main area instead
    expect(screen.getByText('رصيدك خلص')).toBeInTheDocument();
  });
});


describe('Arabic-only shared interface', () => {
  it('renders landscape tariff labels and currency only in Arabic', () => {
    render(<LandscapeMobileView garage={mockGarage} />);

    expect(screen.getByText('تعريفة الساعة')).toBeDefined();
    expect(screen.getByText('المبيت')).toBeDefined();
    expect(screen.getAllByText('جنيه مصري')).toHaveLength(2);
    expect(screen.queryByText('TARIFF PER HOUR')).toBeNull();
    expect(screen.queryByText('OVERNIGHT STAY')).toBeNull();
    expect(screen.queryByText('EGP / جنيه')).toBeNull();
  });

  it('does not expose internal exception details in the error recovery screen', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const BrokenChild = () => {
      throw new Error('sensitive_internal_error_detail');
    };

    render(
      <ErrorBoundary>
        <BrokenChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('عفواً، حدث خطأ مفاجئ')).toBeDefined();
    expect(screen.getByText('تنشيط الصفحة الآن')).toBeDefined();
    expect(screen.queryByText('sensitive_internal_error_detail')).toBeNull();
    consoleError.mockRestore();
  });
});
