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
  warningDaysThreshold: 4,
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

    const warningDaysInput = await screen.findByDisplayValue('4');
    expect(screen.getByDisplayValue('300')).toBeInTheDocument();
    fireEvent.change(warningDaysInput, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ وتطبيق التغييرات' }));

    await waitFor(() => expect(firestoreService.updateSystemConfig).toHaveBeenCalledTimes(1));
    expect(firestoreService.updateSystemConfig).toHaveBeenCalledWith({
      warningDaysThreshold: 9,
      monthlySubscribersFlatFee: 300,
    });
  });

  it('does not overwrite an in-progress edit when the shared snapshot refreshes', async () => {
    const { rerender } = render(<AdminGlobalSettingsView />);
    const warningDaysInput = await screen.findByDisplayValue('4');
    fireEvent.change(warningDaysInput, { target: { value: '9' } });

    configMock.current = { ...storedConfig, warningDaysThreshold: 8 };
    rerender(<AdminGlobalSettingsView />);

    expect(screen.getByDisplayValue('9')).toBeInTheDocument();
  });
});
