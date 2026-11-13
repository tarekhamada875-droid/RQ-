import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GarageDashboardHeaderAndDrawer } from './GarageDashboardHeaderAndDrawer';

const makeProps = () => ({
  garage: { id: 'garage-1', name: 'Test Garage', hasMonthlySubscribers: true } as any,
  currentStaff: null,
  isInputFocused: false,
  isMenuOpen: false,
  setIsMenuOpen: vi.fn(),
  visibleAnnouncement: null,
  onOpenAnnouncement: vi.fn(),
  expiringSubscribersCount: 2,
  hasNewCreditGrant: false,
  onNavigateOverlay: vi.fn(),
  onLogout: vi.fn(),
});

describe('GarageDashboardHeaderAndDrawer icon actions', () => {
  it('names the menu toggle by its current action and keeps menu callbacks intact', () => {
    const props = makeProps();
    const { rerender } = render(<GarageDashboardHeaderAndDrawer {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'فتح القائمة' }));
    expect(props.setIsMenuOpen).toHaveBeenCalledWith(true);

    rerender(<GarageDashboardHeaderAndDrawer {...props} isMenuOpen />);
    const closeButtons = screen.getAllByRole('button', { name: 'إغلاق القائمة' });
    expect(closeButtons).toHaveLength(2);
    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());

    fireEvent.click(closeButtons[1]);
    expect(props.setIsMenuOpen).toHaveBeenCalledWith(false);
  });

  it('hides the retired Packages action for garage owners', () => {
    const props = makeProps();
    render(<GarageDashboardHeaderAndDrawer {...props} isMenuOpen />);

    expect(screen.queryByRole('button', { name: 'الباقات' })).not.toBeInTheDocument();
  });

  it('keeps the owner-only Packages action hidden for staff accounts', () => {
    const props = { ...makeProps(), currentStaff: { id: 'staff-1', name: 'Test Staff' } as any };
    render(<GarageDashboardHeaderAndDrawer {...props} isMenuOpen />);

    expect(screen.queryByRole('button', { name: 'الباقات' })).not.toBeInTheDocument();
  });

  it('exposes charging history in the side panel', () => {
    const props = makeProps();
    render(<GarageDashboardHeaderAndDrawer {...props} isMenuOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'تاريخ الشحن' }));
    expect(props.onNavigateOverlay).toHaveBeenCalledWith('history');
  });
});
