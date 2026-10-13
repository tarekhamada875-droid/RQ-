import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminGlobalSettingsView } from './AdminGlobalSettingsView';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    getSystemConfig: vi.fn(),
    updateSystemConfig: vi.fn(),
  },
}));

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ adminLang: 'ar' }),
}));

vi.mock('../../utils/adminTranslations', () => ({
  useAdminTranslation: () => (key: string) => key,
}));

const storedConfig = {
  defaultTrialDays: 7,
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
  vi.mocked(firestoreService.getSystemConfig).mockResolvedValue(storedConfig as any);
  vi.mocked(firestoreService.updateSystemConfig).mockResolvedValue(undefined);
});

describe('AdminGlobalSettingsView', () => {
  it('updates visible fields without overwriting hidden system settings', async () => {
    render(<AdminGlobalSettingsView />);

    const trialDaysInput = await screen.findByDisplayValue('7');
    expect(screen.getByDisplayValue('4')).toBeInTheDocument();
    expect(screen.getByDisplayValue('300')).toBeInTheDocument();
    fireEvent.change(trialDaysInput, { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ وتطبيق التغييرات' }));

    await waitFor(() => expect(firestoreService.updateSystemConfig).toHaveBeenCalledTimes(1));
    expect(firestoreService.updateSystemConfig).toHaveBeenCalledWith({
      defaultTrialDays: 9,
      warningDaysThreshold: 4,
      monthlySubscribersFlatFee: 300,
    });
  });
});
