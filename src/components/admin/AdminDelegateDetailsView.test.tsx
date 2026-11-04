import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Delegate } from '../../types';
import { ThemeProvider } from '../../utils/ThemeContext';
import { ToastProvider } from '../../hooks/toast';

const serviceMocks = vi.hoisted(() => ({
  settleDelegateAccount: vi.fn().mockResolvedValue(undefined),
  isPinTaken: vi.fn().mockResolvedValue({ taken: false }),
  updateDelegate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services', () => ({
  firestoreService: serviceMocks,
  garageService: serviceMocks,
  garageDeletionService: serviceMocks,
  vehicleService: serviceMocks,
  delegateService: serviceMocks,
  adminService: serviceMocks,
  authService: serviceMocks,
}));

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
    <ToastProvider>
    <AdminDelegateDetailsView
      delegate={delegate}
      setView={vi.fn()}
      setSelectedDelegate={vi.fn()}
      removeDelegate={vi.fn().mockResolvedValue(undefined)}
    />
    </ToastProvider>
  </ThemeProvider>
);

describe('AdminDelegateDetailsView Component (redesigned)', () => {
  beforeEach(() => {
    serviceMocks.settleDelegateAccount.mockReset().mockResolvedValue(undefined);
    serviceMocks.isPinTaken.mockReset().mockResolvedValue({ taken: false });
    serviceMocks.updateDelegate.mockReset().mockResolvedValue(undefined);
  });

  it('renders the delegate name in the header', () => {
    renderDetails();
    expect(screen.getAllByText('Ahmed Delegate').length).toBeGreaterThan(0);
  });

  it('renders lifetime + unsettled commission numbers', () => {
    renderDetails();
    // Lifetime = 500, Unsettled = 5000
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
  });

  it('shows the settle button when there is unsettled commission', () => {
    renderDetails();
    expect(screen.getByText('صرف وتسوية العمولة')).toBeInTheDocument();
  });

  it('hides the settle button when unsettled commission is zero', () => {
    renderDetails({ ...mockDelegate, totalRechargedAmount: 0 });
    expect(screen.queryByText('صرف وتسوية العمولة')).not.toBeInTheDocument();
  });

  it('shows the settle confirmation dialog when settle is clicked', () => {
    renderDetails();
    fireEvent.click(screen.getByText('صرف وتسوية العمولة'));
    expect(screen.getByText('تصفية الحساب')).toBeInTheDocument();
    expect(screen.getAllByText(/5,000/).length).toBeGreaterThan(0);
  });

  it('calls settleDelegateAccount on confirm', async () => {
    renderDetails();
    fireEvent.click(screen.getByText('صرف وتسوية العمولة'));
    fireEvent.click(screen.getByText('تصفية الآن'));
    await waitFor(() => expect(serviceMocks.settleDelegateAccount).toHaveBeenCalledTimes(1));
  });

  it('shows the delete confirmation dialog when delete is clicked', () => {
    renderDetails();
    // Click the header trash button
    const deleteButtons = screen.getAllByTitle('سحب الصلاحية');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('سحب الصلاحية')).toBeInTheDocument();
    expect(screen.getAllByText(/Ahmed Delegate/).length).toBeGreaterThan(0);
  });

  it('renders the phone number from the profile card', () => {
    renderDetails();
    expect(screen.getByText('01012345678')).toBeInTheDocument();
  });
});
