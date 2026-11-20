import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminConfigSyncView } from './AdminConfigSyncView';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../api/apiClient', () => ({ apiFetch }));

describe('AdminConfigSyncView — owner manual "sync now" page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the sync endpoint and reports success with the synced values', async () => {
    apiFetch.mockResolvedValueOnce({
      success: true,
      cacheSync: 'ok',
      config: { creditRate: 1, paymentWalletNumber: '0102345678' },
    });
    render(<AdminConfigSyncView onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /مزامنة الآن/ }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/sync-system-config-cache', { method: 'POST' });
    });
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('تمت المزامنة بنجاح');
    expect(status).toHaveTextContent('0102345678');
  });

  it('shows the retry message when the sync call fails', async () => {
    apiFetch.mockRejectedValueOnce(new Error('network down'));
    render(<AdminConfigSyncView onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /مزامنة الآن/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('تعذّرت المزامنة');
  });

  it('treats a not_configured environment as a successful no-op', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, cacheSync: 'not_configured', config: {} });
    render(<AdminConfigSyncView onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /مزامنة الآن/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('لا توجد نسخة محفوظة');
  });

  it('shows the generic failure message when the server reports a failed sync', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, cacheSync: 'failed' });
    render(<AdminConfigSyncView onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /مزامنة الآن/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('تعذّرت المزامنة');
  });
});
