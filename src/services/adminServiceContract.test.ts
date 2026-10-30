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
      'addStaff',
      'addSubscriber',
      'adminCorrectGarageCredits',
      'adminGrantGarageCredits',
      'deleteSubscriber',
      'getActivityLogsSince',
      'getGarageCreditLedger',
      'getMoreSubscribers',
      'getStaffByGarageOnce',
      'getSubscriberByPlateOnce',
      'getSubscribersByPlateAcrossGarages',
      'getSystemConfig',
      'getSystemLogsByPlateOnce',
      'removeStaff',
      'renewSubscriber',
      'subscribeToAdminPin',
      'subscribeToGarageRechargeLogs',
      'subscribeToGarageStaff',
      'subscribeToSubscribers',
      'subscribeToSystemConfig',
      'updateAdminPin',
      'updateStaff',
      'updateSubscriber',
      'updateSystemConfig',
    ]);
  });

  it('uses one Worker API bootstrap call and does not attach a raw Firestore listener', async () => {
    const callback = vi.fn();
    mocks.apiFetch.mockResolvedValue({ success: true, config: { adminColor: '#334455' } });

    const unsubscribe = adminService.subscribeToSystemConfig(callback);
    await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(mocks.apiFetch).toHaveBeenCalledWith('/api/system-config');
    expect(callback).toHaveBeenCalledWith({ adminColor: '#334455' });
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    unsubscribe();
    expect(mocks.listenerRegister).toHaveBeenCalledOnce();
  });

  it('uses defaults until the Worker session is ready, then refreshes through the API', async () => {
    const callback = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.apiFetch
      .mockRejectedValueOnce(new Error('session not active yet'))
      .mockResolvedValueOnce({ success: true, config: { adminColor: '#445566' } });

    const unsubscribe = adminService.subscribeToSystemConfig(callback);
    await waitFor(() => expect(callback).toHaveBeenCalledWith({
      adminColor: '#10b981'
    }));

    window.dispatchEvent(new Event('rq-session-ready'));
    await waitFor(() => expect(callback).toHaveBeenCalledWith({ adminColor: '#445566' }));
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
    expect(mocks.onSnapshot).not.toHaveBeenCalled();
    unsubscribe();
  });
});
