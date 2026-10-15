import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CheckOutModal } from './CheckOutModal';

vi.mock('motion/react', async () => {
  const { createElement, Fragment } = await import('react');
  const MotionDiv = ({ children, initial, animate, exit, transition, ...props }: any) =>
    createElement('div', props, children);
  const AnimatePresence = ({ children }: any) => createElement(Fragment, null, children);
  return { motion: { div: MotionDiv }, AnimatePresence };
});

vi.mock('../ui/EgyptianPlate', () => ({
  EgyptianPlate: ({ plateNumber }: { plateNumber: string }) => <span>{plateNumber}</span>,
}));

const makeProps = () => {
  const now = new Date('2026-10-15T12:00:00.000Z');
  return {
    selectedVehicle: {
      id: 'vehicle-1',
      plateNumber: 'ABC 123',
      entryTime: new Date(now.getTime() - 60 * 60 * 1000),
      isSubscriber: false,
      type: 'hourly',
      staffId: 'staff-1',
      staffName: 'Test Staff',
    } as any,
    garage: {
      id: 'garage-1',
      name: 'Test Garage',
      hourlyRate: 10,
      overnightRate: 30,
    } as any,
    currentStaff: { id: 'staff-1', name: 'Test Staff' } as any,
    isLoading: false,
    loadingType: null,
    now,
    onConfirm: vi.fn(),
    onDelete: vi.fn(),
    onCancel: vi.fn(),
  };
};

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CheckOutModal icon actions', () => {
  it('gives the two side actions distinct names and preserves left-side checkout confirmation', () => {
    const props = makeProps();
    render(<CheckOutModal {...props} />);

    const leftButton = screen.getByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيسر' });
    const rightButton = screen.getByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيمن' });
    expect(leftButton).toHaveAccessibleName();
    expect(rightButton).toHaveAccessibleName();
    expect(leftButton.getAttribute('aria-label')).not.toBe(rightButton.getAttribute('aria-label'));
    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());

    fireEvent.click(leftButton);
    const confirmButton = screen.getByRole('button', { name: 'تأكيد خروج السيارة ABC 123' });
    expect(confirmButton).toHaveAccessibleName();
    fireEvent.click(confirmButton);
    expect(props.onConfirm).toHaveBeenCalledOnce();
  });

  it('preserves the right-side confirmation action', () => {
    render(<CheckOutModal {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيمن' }));
    expect(screen.getByRole('button', { name: 'تأكيد خروج السيارة ABC 123' })).toBeInTheDocument();
  });

  it('keeps close and visible delete actions connected to their callbacks', () => {
    const props = makeProps();
    render(<CheckOutModal {...props} />);

    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(props.onCancel).toHaveBeenCalledOnce();

    fireEvent.click(screen.getAllByRole('button', { name: 'حذف السيارة (خطأ إدخال)' })[0]);
    expect(props.onDelete).toHaveBeenCalledOnce();
  });
});
