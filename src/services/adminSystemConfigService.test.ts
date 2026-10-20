import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const { apiFetchMock, authMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  authMock: { currentUser: { uid: 'test-user' } as { uid: string } | null }
}));

vi.mock('../api/apiClient', () => ({ apiFetch: apiFetchMock }));
vi.mock('../firebase', () => ({
  auth: authMock,
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'update' }
}));

import { adminSystemConfigService } from './adminSystemConfigService';

describe('adminSystemConfigService Worker-backed subscription', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    authMock.currentUser = { uid: 'test-user' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes after the authenticated Worker session becomes ready', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    apiFetchMock
      .mockRejectedValueOnce(new Error('session not active yet'))
      .mockResolvedValueOnce({
        success: true,
        config: {
          monthlySubscribersFlatFee: 310,
          adminColor: '#223344'
        }
      });

    const onConfig = vi.fn();
    const unsubscribe = adminSystemConfigService.subscribeToSystemConfig(onConfig);

    await waitFor(() => expect(onConfig).toHaveBeenCalledWith({
      monthlySubscribersFlatFee: 250,
      adminColor: '#10b981'
    }));

    window.dispatchEvent(new Event('rq-session-ready'));
    await waitFor(() => expect(onConfig).toHaveBeenCalledWith({
      monthlySubscribersFlatFee: 310,
      adminColor: '#223344'
    }));
    expect(apiFetchMock).toHaveBeenCalledTimes(2);

    unsubscribe();
  });
});
