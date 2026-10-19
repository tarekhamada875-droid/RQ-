import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('preserves the complete public method key set', () => {
    expect(Object.keys(adminService).sort()).toEqual([
      'addActivityLog',
      'addCoupon',
      'addPackage',
      'addStaff',
      'addSubscriber',
      'adminExtendFairUse',
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
      'updateTrialDecision',
      'updateWalletNumber'
    ]);
  });

  it('uses one API bootstrap call when the Firestore snapshot exists and preserves callback order', async () => {
    const callback = vi.fn();
    mocks.apiFetch.mockResolvedValue({ success: true, config: { walletNumber: '0123' } });
    const unsubscribeSnapshot = vi.fn();
    mocks.onSnapshot.mockImplementationOnce((_ref: unknown, onNext: (snapshot: unknown) => void) => {
      onNext({ exists: () => true, id: 'global', data: () => ({ walletNumber: '0123' }) });
      return unsubscribeSnapshot;
    });

    const unsubscribe = adminService.subscribeToSystemConfig(callback);
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls.map(([config]) => config)).toEqual([
      { id: 'global', walletNumber: '0123' },
      { walletNumber: '0123' }
    ]);
    unsubscribe();
    expect(unsubscribeSnapshot).toHaveBeenCalledOnce();
    expect(mocks.listenerRegister).toHaveBeenCalledOnce();
  });

  it('keeps one fallback API call for an empty snapshot after the bootstrap attempt', async () => {
    const callback = vi.fn();
    mocks.apiFetch
      .mockResolvedValueOnce({ success: true, config: { walletNumber: '0123' } })
      .mockResolvedValueOnce({ success: true, config: { walletNumber: '0456' } });
    mocks.onSnapshot.mockImplementationOnce((_ref: unknown, onNext: (snapshot: unknown) => void) => {
      onNext({ exists: () => false, id: 'global', data: () => undefined });
      return vi.fn();
    });

    const unsubscribe = adminService.subscribeToSystemConfig(callback);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith({ walletNumber: '0456' });
    unsubscribe();
  });
});
