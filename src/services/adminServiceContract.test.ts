import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn(() => ({ path: 'system_config/global' })),
  auth: { currentUser: { uid: 'admin-test' } },
  listenerRegister: vi.fn(() => vi.fn())
}));

vi.mock('../api/apiClient', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../firebase', () => ({
  auth: mocks.auth,
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' }
}));
vi.mock('firebase/firestore', () => ({
  onSnapshot: mocks.onSnapshot,
  doc: mocks.doc
}));
vi.mock('../utils/listenerTracker', () => ({ listenerTracker: { register: mocks.listenerRegister } }));

import { adminService } from './adminService';

describe('adminService facade contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.currentUser = { uid: 'admin-test' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the complete public method key set', () => {
    expect(Object.keys(adminService).sort()).toEqual([
      'addActivityLog',
      'addCoupon',
      'addPackage',
      'addStaff',
      'addSubscriber',
      'adminGrantGarageCredits',
      'createAnnouncement',
      'deleteAnnouncement',
      'deleteCoupon',
      'deletePackage',
      'deleteSubscriber',
      'getActivityLogsSince',
      'getAdminSummary',
      'getFinancialReport',
      'getGarageCreditLedger',
      'getMoreSubscribers',
      'getPaginatedActivityLogs',
      'getStaffByGarageOnce',
      'getSubscriberByPlateOnce',
      'getSystemConfig',
      'getSystemLogsByPlateOnce',
      'onAnnouncementsChange',
      'removeStaff',
      'renewSubscriber',
      'subscribeToAdminPin',
      'subscribeToCoupons',
      'subscribeToGarageRechargeLogs',
      'subscribeToGarageStaff',
      'subscribeToPackages',
      'subscribeToSubscribers',
      'subscribeToSystemConfig',
      'toggleAnnouncementActive',
      'updateAdminPin',
      'updateCoupon',
      'updateStaff',
      'updateSubscriber',
      'updateSystemConfig',
      'updateTrialDecision'
    ]);
  });

  it('uses one Worker API bootstrap call and does not attach a raw Firestore listener', async () => {
    const callback = vi.fn();
    mocks.apiFetch.mockResolvedValue({ success: true, config: { monthlySubscribersFlatFee: 250 } });

    const unsubscribe = adminService.subscribeToSystemConfig(callback);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/system-config');
    expect(callback).toHaveBeenCalledWith({ monthlySubscribersFlatFee: 250 });
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    unsubscribe();
    expect(mocks.listenerRegister).toHaveBeenCalledOnce();
  });

  it('uses defaults until the Worker session is ready, then refreshes through the API', async () => {
    const callback = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.apiFetch
      .mockRejectedValueOnce(new Error('session not active yet'))
      .mockResolvedValueOnce({ success: true, config: { monthlySubscribersFlatFee: 450 } });

    const unsubscribe = adminService.subscribeToSystemConfig(callback);
    await waitFor(() => expect(callback).toHaveBeenCalledWith({
      defaultTrialDays: 2,
      warningDaysThreshold: 3,
      monthlySubscribersFlatFee: 250,
      adminColor: '#10b981'
    }));

    window.dispatchEvent(new Event('rq-session-ready'));
    await waitFor(() => expect(callback).toHaveBeenCalledWith({ monthlySubscribersFlatFee: 450 }));
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    unsubscribe();
  });
});
