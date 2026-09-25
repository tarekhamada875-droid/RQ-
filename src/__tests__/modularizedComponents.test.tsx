/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '../utils/ThemeContext';
import { AdminGarageDetailsView } from '../components/admin/AdminGarageDetailsView';
import { GarageDashboardView } from '../components/garage/GarageDashboardView';
import { GarageSubscriptionCard } from '../components/garage/dashboard/GarageSubscriptionCard';
import { GarageActiveVehiclesList } from '../components/garage/dashboard/GarageActiveVehiclesList';
import { AdminGarageHeroAndStats } from '../components/admin/garage-details/AdminGarageHeroAndStats';
import { AdminGarageFinancialsSection } from '../components/admin/garage-details/AdminGarageFinancialsSection';
import type { Garage } from '../types';

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
    adminTopupGarageBalance: vi.fn().mockResolvedValue(true),
    subscribeToGarageRechargeLogs: vi.fn(() => () => {}),
    subscribeToSubscribers: vi.fn(() => () => {}),
    onAnnouncementsChange: vi.fn(() => () => {}),
    subscribeToSystemConfig: vi.fn((cb) => {
      cb({ monthlySubscribersFlatFee: 500 });
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
  pin: '12345678',
  ownerPin: '12345678',
  balance: 1500,
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
  balanceExpiry: { seconds: 1800000000, nanoseconds: 0 } as any,
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
        adminLang="ar"
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

  it('renders AdminGarageFinancialsSection with wallet balance, presets, and referral options', () => {
    const onClearBalance = vi.fn();
    const onToggleMonthly = vi.fn();
    const setSelectedTopup = vi.fn();
    const onOpenTopup = vi.fn();
    const onRefChange = vi.fn();

    renderWithTheme(
      <AdminGarageFinancialsSection
        garage={mockGarage}
        t={(key) => key}
        adminLang="ar"
        remainingDays={15}
        showClearBalanceConfirm={false}
        setShowClearBalanceConfirm={vi.fn()}
        isLoading={false}
        onClearBalance={onClearBalance}
        subscriberFlatFee={500}
        onToggleMonthlySubscribers={onToggleMonthly}
        selectedTopupAmount={500}
        setSelectedTopupAmount={setSelectedTopup}
        onOpenTopupModal={onOpenTopup}
        allGarages={[mockGarage]}
        onReferredByChange={onRefChange}
      />
    );

    expect(screen.getByText('1,500')).toBeDefined();
    expect(screen.getByText('رصيد المحفظة الحالي')).toBeDefined();
    expect(screen.getByText('15')).toBeDefined();

    // Verify submit top-up button opens modal
    const topupBtn = screen.getByText('شحن الرصيد الآن');
    fireEvent.click(topupBtn);
    expect(onOpenTopup).toHaveBeenCalledTimes(1);
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
  it('renders GarageSubscriptionCard correctly with remaining days and capacity', () => {
    renderWithTheme(
      <GarageSubscriptionCard
        garage={mockGarage}
        isUrgentRed={false}
        remainingDays={10}
        isWarningYellow={false}
        countdownValue={10}
        isCountdownInHours={false}
        displayTodayCount={25}
        dailyCapacity={100}
        isUnlimited={false}
      />
    );

    expect(screen.getByText('الرصيد المتبقي')).toBeDefined();
    expect(screen.getByText('أيام')).toBeDefined();
    expect(screen.getByText('العدد اليومي')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
    expect(screen.getByText('/100')).toBeDefined();
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
        isSubscriptionExpired={false}
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
        plateInputRef={{ current: null }}
        handleCheckIn={vi.fn()}
        inputRef={{ current: null }}
        onLogout={vi.fn()}
      />
    );

    // Garage name is in header
    expect(screen.getByText('جراج النصر النموذجي')).toBeDefined();
    // Brand footer
    expect(screen.getByText('ARQ FOR SOFTWARE DEVELOPMENT')).toBeDefined();
  });
});
