import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminGlobalSettingsView } from './AdminGlobalSettingsView';
import { firestoreService } from '../../services';

const configMock = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('../../services', () => ({
  firestoreService: {
    updateSystemConfig: vi.fn(),
  },
}));

vi.mock('../../hooks/useSystemConfig', () => ({
  useSystemConfig: () => configMock.current,
}));

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ adminLang: 'ar' }),
}));

vi.mock('../../utils/adminTranslations', () => ({
  useAdminTranslation: () => (key: string) => key,
}));

const storedConfig = {
  monthlySubscribersFlatFee: 300,
  monthlySubscribersSurchargePercent: 37,
  referralFeePerRenewal: 45,
  delegateMonthlyCommission: 55,
  isMaintenanceMode: true,
  maintenanceMessage: 'Scheduled maintenance',
};

beforeEach(() => {
  vi.clearAllMocks();
  configMock.current = { ...storedConfig };
  vi.mocked(firestoreService.updateSystemConfig).mockResolvedValue(undefined);
});

describe('AdminGlobalSettingsView', () => {
  it('updates visible fields without overwriting hidden system settings', async () => {
    render(<AdminGlobalSettingsView />);

    expect(await screen.findByDisplayValue('300')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'حفظ وتطبيق التغييرات' }));

    await waitFor(() => expect(firestoreService.updateSystemConfig).toHaveBeenCalledTimes(1));
    expect(firestoreService.updateSystemConfig).toHaveBeenCalledWith({
      monthlySubscribersFlatFee: 300,
    });
  });

  it('does not overwrite an in-progress edit when the shared snapshot refreshes', async () => {
    const { rerender } = render(<AdminGlobalSettingsView />);
    const monthlyFeeInput = await screen.findByDisplayValue('300');
    fireEvent.change(monthlyFeeInput, { target: { value: '350' } });

    configMock.current = { ...storedConfig, };
    rerender(<AdminGlobalSettingsView />);

    expect(screen.getByDisplayValue('350')).toBeInTheDocument();
  });
});
