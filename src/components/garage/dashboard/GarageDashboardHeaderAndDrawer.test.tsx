import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GarageDashboardHeaderAndDrawer } from './GarageDashboardHeaderAndDrawer';

vi.mock('motion/react', async () => {
  const { createElement, Fragment } = await import('react');
  const MotionDiv = ({ children, initial, animate, exit, transition, ...props }: any) =>
    createElement('div', props, children);
  const AnimatePresence = ({ children }: any) => createElement(Fragment, null, children);
  return { motion: { div: MotionDiv }, AnimatePresence };
});

const makeProps = () => ({
  garage: { id: 'garage-1', name: 'Test Garage', hasMonthlySubscribers: true } as any,
  currentStaff: null,
  isInputFocused: false,
  isMenuOpen: false,
  setIsMenuOpen: vi.fn(),
  visibleAnnouncement: null,
  onOpenAnnouncement: vi.fn(),
  expiringSubscribersCount: 2,
  hasNewRecharge: false,
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

  it('exposes charging history in the side panel', () => {
    const props = makeProps();
    render(<GarageDashboardHeaderAndDrawer {...props} isMenuOpen />);

    fireEvent.click(screen.getByRole('button', { name: 'سجل شحن الباقات' }));
    expect(props.onNavigateOverlay).toHaveBeenCalledWith('history');
  });
});
