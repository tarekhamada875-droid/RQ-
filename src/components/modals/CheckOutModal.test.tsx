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

const makeProps = (minutesSinceEntry = 60) => {
  const now = new Date('2026-10-15T12:00:00.000Z');
  return {
    selectedVehicle: {
      id: 'vehicle-1',
      plateNumber: 'ABC 123',
      entryTime: new Date(now.getTime() - minutesSinceEntry * 60 * 1000),
      isSubscriber: false,
      type: 'hourly',
      staffId: 'staff-1',
      enteredByEntityId: 'staff-1',
      enteredByRole: 'staff',
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

  it('keeps one delete action visible during the five-minute entry-error window', () => {
    const props = makeProps(2);
    render(<CheckOutModal {...props} />);

    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(props.onCancel).toHaveBeenCalledOnce();

    expect(screen.getAllByRole('button', { name: 'حذف السيارة (خطأ إدخال)' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'حذف السيارة (خطأ إدخال)' }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it('allows a garage owner to delete only a vehicle they entered', () => {
    const props = makeProps(2);
    props.currentStaff = null;
    props.selectedVehicle.staffId = 'garage-1';
    props.selectedVehicle.enteredByEntityId = 'garage-1';
    props.selectedVehicle.enteredByRole = 'garage';
    render(<CheckOutModal {...props} />);

    expect(screen.getByRole('button', { name: 'حذف السيارة (خطأ إدخال)' })).toBeInTheDocument();
  });

  it('hides delete for another staff account and for legacy records without stable entrant metadata', () => {
    const otherStaffProps = makeProps(2);
    otherStaffProps.selectedVehicle.enteredByEntityId = 'staff-2';
    otherStaffProps.selectedVehicle.staffId = 'staff-2';
    const { rerender } = render(<CheckOutModal {...otherStaffProps} />);
    expect(screen.queryByRole('button', { name: 'حذف السيارة (خطأ إدخال)' })).toBeNull();

    const legacyProps = makeProps(2);
    delete legacyProps.selectedVehicle.enteredByEntityId;
    delete legacyProps.selectedVehicle.enteredByRole;
    rerender(<CheckOutModal {...legacyProps} />);
    expect(screen.queryByRole('button', { name: 'حذف السيارة (خطأ إدخال)' })).toBeNull();
  });

  it('hides the delete action after the five-minute entry-error window', () => {
    render(<CheckOutModal {...makeProps(6)} />);

    expect(screen.queryByRole('button', { name: 'حذف السيارة (خطأ إدخال)' })).toBeNull();
  });
});
