import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Delegate } from '../../types';
import { ThemeProvider } from '../../utils/ThemeContext';

const serviceMocks = vi.hoisted(() => ({
  getDelegateRecharges: vi.fn().mockResolvedValue([]),
  settleDelegateAccount: vi.fn().mockResolvedValue(undefined),
  updateDelegate: vi.fn().mockResolvedValue(undefined),
  isPinTaken: vi.fn().mockResolvedValue({ taken: false })
}));

vi.mock('../../services', () => ({ firestoreService: serviceMocks }));

import { AdminDelegateDetailsView } from './AdminDelegateDetailsView';

const mockDelegate: Delegate = {
  id: 'del-123',
  name: 'Ahmed Delegate',
  phone: '01012345678',
  pin: '12345678',
  role: 'delegate',
  createdAt: '2026-01-01T00:00:00Z',
  totalRechargedAmount: 5000,
  totalCommissionEarned: 500
};

const renderDetails = (delegate: Delegate = mockDelegate) => render(
  <ThemeProvider>
    <AdminDelegateDetailsView
      delegate={delegate}
      setView={vi.fn()}
      setSelectedDelegate={vi.fn()}
      removeDelegate={vi.fn().mockResolvedValue(undefined)}
    />
  </ThemeProvider>
);

describe('AdminDelegateDetailsView Component', () => {
  beforeEach(() => {
    serviceMocks.getDelegateRecharges.mockReset().mockResolvedValue([]);
  });

  it('renders delegate profile details and stats cards', async () => {
    renderDetails();

    expect((await screen.findAllByText('Ahmed Delegate')).length).toBeGreaterThan(0);
    expect(screen.getByText('01012345678')).toBeInTheDocument();
    expect(screen.getByText('سجل الشحن')).toBeInTheDocument();
  });

  it('renders retained historical activity logs and includes them in totals and commission', async () => {
    serviceMocks.getDelegateRecharges.mockResolvedValue([{
      id: 'activity-recharge-1',
      garageId: 'garage-history',
      staffId: 'del-123',
      actionType: 'recharge',
      amount: 1500,
      commission: 150,
      plateNumber: 'HISTORIC-RECHARGE-1',
      timestamp: new Date()
    }]);

    renderDetails({ ...mockDelegate, totalRechargedAmount: 0, totalCommissionEarned: 0 });
    fireEvent.click(await screen.findByText('سجل الشحن'));

    expect(await screen.findByText('HISTORIC-RECHARGE-1')).toBeInTheDocument();
    expect(screen.getByText('عرض آخر 50 معاملة')).toBeInTheDocument();
    expect(screen.getByText('ناجح')).toBeInTheDocument();
    expect(screen.getAllByText('1,500').length).toBeGreaterThan(0);
    expect(screen.getAllByText('150').length).toBeGreaterThan(0);
    expect(serviceMocks.getDelegateRecharges).toHaveBeenCalledWith('del-123');
  });
  it('ignores late history responses from the previously selected delegate', async () => {
    let resolveOld!: (value: any[]) => void;
    let resolveNew!: (value: any[]) => void;
    const oldHistory = new Promise<any[]>(resolve => { resolveOld = resolve; });
    const newHistory = new Promise<any[]>(resolve => { resolveNew = resolve; });
    serviceMocks.getDelegateRecharges.mockImplementation((id: string) =>
      id === 'del-123' ? oldHistory : newHistory
    );

    const { rerender } = renderDetails(mockDelegate);
    const nextDelegate = { ...mockDelegate, id: 'del-456', name: 'New Delegate' };
    rerender(
      <ThemeProvider>
        <AdminDelegateDetailsView
          delegate={nextDelegate}
          setView={vi.fn()}
          setSelectedDelegate={vi.fn()}
          removeDelegate={vi.fn().mockResolvedValue(undefined)}
        />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByText('سجل الشحن'));
    resolveNew([{
      id: 'new-history',
      garageId: 'garage-history',
      staffId: 'del-456',
      actionType: 'recharge',
      amount: 250,
      commission: 25,
      plateNumber: 'NEW-HISTORY',
      timestamp: new Date()
    }]);
    expect(await screen.findByText('NEW-HISTORY')).toBeInTheDocument();

    resolveOld([{
      id: 'old-history',
      garageId: 'garage-history',
      staffId: 'del-123',
      actionType: 'recharge',
      amount: 900,
      commission: 90,
      plateNumber: 'OLD-HISTORY',
      timestamp: new Date()
    }]);

    await waitFor(() => {
      expect(screen.queryByText('OLD-HISTORY')).not.toBeInTheDocument();
      expect(screen.getByText('NEW-HISTORY')).toBeInTheDocument();
    });
  });

});
