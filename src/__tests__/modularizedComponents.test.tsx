/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '../utils/ThemeContext';
import { ToastProvider } from '../hooks/toast';
import { AdminGarageDetailsView } from '../components/admin/AdminGarageDetailsView';
import { GarageDashboardView } from '../components/garage/GarageDashboardView';
import { GarageInputProvider } from '../hooks/garageInput';

vi.mock('../hooks/vehicleOpsContext', () => ({
  VehicleOpsProvider: ({ children }: any) => children,
  useVehicleOps: () => ({
    setSelectedVehicle: vi.fn(),
    setShowCheckOutModal: vi.fn(),
    newPlateNumber: '',
    setNewPlateNumber: vi.fn(),
    handleCheckIn: vi.fn(),
    isLoading: false,
    checkoutJustSucceeded: false,
  }),
}));
import { LandscapeMobileView } from '../components/layout/LandscapeMobileView';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { GarageSubscriptionCard } from '../components/garage/dashboard/GarageSubscriptionCard';
import { AdminGarageHeroAndStats } from '../components/admin/garage-details/AdminGarageHeroAndStats';
import { AdminGarageFinancialsSection } from '../components/admin/garage-details/AdminGarageFinancialsSection';
import type { Garage } from '../types';

// Mock audio soundManager
vi.mock('../utils/sounds', () => ({
  soundManager: {
    play: vi.fn(),
  },
}));

// Mock named services
vi.mock('../services', () => { const _svc = {
    updateGarage: vi.fn().mockResolvedValue(true),
    getGarageById: vi.fn().mockResolvedValue(null),
    getDashboardSummary: vi.fn().mockResolvedValue({ entriesToday: 0 }),
    isPinTaken: vi.fn().mockResolvedValue({ taken: false }),
    subscribeToCreditGrantLogs: vi.fn(() => () => {}),
    subscribeToSubscribers: vi.fn(() => () => {}),
    subscribeToSystemConfig: vi.fn((cb) => {
      cb({ adminColor: '#10b981' });
      return () => {};
    }),
  }; return { garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });

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
  return render(<ThemeProvider><ToastProvider>{ui}</ToastProvider></ThemeProvider>);
};

// PERF (audit 2026-11-08): FastInput uses a native 'input' event listener,
// not React's onChange. fireEvent.change fires a React synthetic 'change'
// event which FastInput doesn't see. To fill a FastInput in tests, we must
// set the DOM value directly and dispatch a native 'input' event, then
// blur to trigger onCommit.
//
// (Removed with the staff-management UI: the only test that needed this
// helper was the staff add/delete flow, which is gone. Kept the comment
// as a note for the next person who needs to fill a FastInput here.)

describe('Modularized Admin Components Integrity', () => {
  it('renders AdminGarageHeroAndStats with correct status and KPI stats', () => {
    const onToggleLock = vi.fn();
    const onOpenEditPin = vi.fn();

    renderWithTheme(
      <AdminGarageHeroAndStats
        garage={mockGarage}
       
        isUpdatingLock={false}
        onToggleLock={onToggleLock}
        onOpenEditPin={onOpenEditPin}
      />
    );

    expect(screen.getByText('جراج النصر النموذجي')).toBeDefined();
    expect(screen.getByText('01012345678')).toBeDefined();
    expect(screen.getByText('نشط')).toBeDefined();

    // Trigger lock button
    const lockBtn = screen.getByText('إيقاف الخدمة فوراً');
    fireEvent.click(lockBtn);
    expect(onToggleLock).toHaveBeenCalledTimes(1);
  });

  it('renders current non-wallet financial settings', () => {
    const onToggleMonthly = vi.fn();

    renderWithTheme(
      <AdminGarageFinancialsSection
        garage={mockGarage}
       
        onToggleMonthlySubscribers={onToggleMonthly}
      />
    );

    expect(screen.getByText('خدمة المشتركين الشهريين / الإيواء')).toBeDefined();
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
    // Credit balance displays Arabic-Indic digits (١٥) per garage-interface UX rule.
    expect(screen.getByText('١٥')).toBeDefined();
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

  it('shows staggered digital rain across the credit card after a deduction', () => {
    const initialGarage = { ...mockGarage, billingModel: 'prepaid_credits', credits: 15 } as any;
    const deductedGarage = { ...initialGarage, credits: 13 };
    const { rerender } = renderWithTheme(<GarageSubscriptionCard garage={initialGarage} />);

    rerender(<ThemeProvider><ToastProvider><GarageSubscriptionCard garage={deductedGarage} /></ToastProvider></ThemeProvider>);

    expect(screen.getByTestId('credit-debit-feedback')).toBeDefined();
    const arrows = screen.getAllByTestId('credit-debit-arrow');
    expect(arrows).toHaveLength(5);
    // Center-out order: center first, then inner pair, then outer pair
    expect(arrows[0]).toHaveClass('credit-debit-arrow-center');
    expect(arrows[1]).toHaveClass('credit-debit-arrow-inner-left');
    expect(arrows[2]).toHaveClass('credit-debit-arrow-inner-right');
    expect(arrows[3]).toHaveClass('credit-debit-arrow-outer-left');
    expect(arrows[4]).toHaveClass('credit-debit-arrow-outer-right');
    arrows.forEach((track) => {
      expect(track.tagName.toLowerCase()).toBe('span');
      // Digital-rain costume: one main light streak per track, no SVG arrows.
      expect(track.querySelector('.credit-debit-rain')).not.toBeNull();
      expect(track.querySelector('.credit-debit-rain-thin')).toBeNull();
      expect(track.querySelector('svg')).toBeNull();
    });
    // Fainter thin companions ride their own tracks, one per position.
    const thin = screen.getAllByTestId('credit-debit-arrow-thin');
    expect(thin).toHaveLength(5);
    thin.forEach((track) => {
      expect(track).toHaveClass('credit-debit-arrow-thin');
      expect(track.querySelector('.credit-debit-rain-thin')).not.toBeNull();
    });
  });

  it('renders GarageDashboardView orchestrator with plate registration and menu drawer triggers', () => {
    renderWithTheme(
      <GarageInputProvider>
      <GarageDashboardView
        garage={mockGarage}
        closeKeyboard={vi.fn()}
        onLogout={vi.fn()}
        showToast={vi.fn()}
        staffList={[]}
        ensureStaffLoaded={vi.fn().mockResolvedValue(undefined)}
        showSubscribers={false}
        setShowSubscribers={vi.fn()}
      />
      </GarageInputProvider>
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
      <GarageInputProvider>
      <GarageDashboardView
        garage={depletedGarage}
        closeKeyboard={vi.fn()}
        onLogout={vi.fn()}
        showToast={vi.fn()}
        staffList={[]}
        ensureStaffLoaded={vi.fn().mockResolvedValue(undefined)}
        showSubscribers={false}
        setShowSubscribers={vi.fn()}
      />
      </GarageInputProvider>
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
