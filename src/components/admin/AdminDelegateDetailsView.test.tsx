import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminDelegateDetailsView } from './AdminDelegateDetailsView';
import { Delegate } from '../../types';
import { ThemeProvider } from '../../utils/ThemeContext';

vi.mock('../../services', () => ({
  firestoreService: {
    getDelegateRecharges: vi.fn().mockResolvedValue([]),
    getDelegateRechargeRequests: vi.fn().mockResolvedValue([]),
    settleDelegateAccount: vi.fn().mockResolvedValue(undefined),
    updateDelegate: vi.fn().mockResolvedValue(undefined),
    isPinTaken: vi.fn().mockResolvedValue({ taken: false }),
  }
}));

const mockDelegate: Delegate = {
  id: 'del-123',
  name: 'Ahmed Delegate',
  phone: '01012345678',
  pin: '12345678',
  role: 'delegate',
  createdAt: '2026-01-01T00:00:00Z',
  totalRechargedAmount: 5000,
  totalCommissionEarned: 500,
};

describe('AdminDelegateDetailsView Component', () => {
  it('renders delegate profile details and stats cards', async () => {
    const setView = vi.fn();
    const setSelectedDelegate = vi.fn();
    const removeDelegate = vi.fn().mockResolvedValue(undefined);

    render(
      <ThemeProvider>
        <AdminDelegateDetailsView
          delegate={mockDelegate}
          setView={setView}
          setSelectedDelegate={setSelectedDelegate}
          removeDelegate={removeDelegate}
        />
      </ThemeProvider>
    );

    expect(screen.getAllByText('Ahmed Delegate').length).toBeGreaterThan(0);
    expect(screen.getByText('01012345678')).toBeInTheDocument();
    expect(screen.getByText('سجل الشحن')).toBeInTheDocument();
  });
});
