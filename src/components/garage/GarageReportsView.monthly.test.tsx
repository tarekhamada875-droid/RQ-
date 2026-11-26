import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getMonthlyRevenue: vi.fn(),
}));

vi.mock('../../services', () => ({
  garageService: { getGarageById: vi.fn(), getDashboardSummary: vi.fn() },
  vehicleService: { getMonthlyRevenue: mocks.getMonthlyRevenue },
  isFreshGarageDashboardSummary: () => false,
}));

import { GarageReportsView } from './GarageReportsView';

const makeGarage = () => ({
  id: 'garage-monthly-test',
  name: 'Test Garage',
  status: 'approved',
}) as any;

describe('GarageReportsView monthly revenue card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMonthlyRevenue.mockResolvedValue({ totalRevenue: 43975, daysWithData: 12 });
  });

  it('shows the total with no icon and no redundant coverage note', async () => {
    const { container } = render(
      <GarageReportsView garage={makeGarage()} staffList={[]} ensureStaffLoaded={vi.fn().mockResolvedValue(undefined)} onClose={vi.fn()} />
    );

    // Enter the monthly report from the chooser.
    fireEvent.click(screen.getByText('تقرير شهري'));

    // The label and the big Arabic-Indic number stay.
    await waitFor(() => expect(screen.getByText('٤٣٩٧٥')).toBeTruthy());
    expect(screen.getByText('إجمالي الإيرادات — آخر ٣٠ يوم')).toBeTruthy();
    expect(screen.getByText('ج.م')).toBeTruthy();

    // Owner decision: the redundant "بيانات من … يوم خلال آخر ٣٠ يوم" note is gone.
    expect(screen.queryByText(/بيانات من/)).toBeNull();

    // Owner decision: the decorative TrendingUp icon is gone from the monthly card.
    expect(container.querySelector('.lucide-trending-up')).toBeNull();
  });
});
