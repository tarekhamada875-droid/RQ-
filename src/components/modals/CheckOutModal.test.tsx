import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CheckOutModal } from './CheckOutModal';
import { ServerTimeProvider } from '../../hooks/serverTimeContext';
import { getCairoDateKey } from '../../domain/garage/businessDay';

const now = new Date('2026-10-15T12:00:00.000Z');

vi.mock('../../hooks/serverTimeContext', () => ({
  ServerTimeProvider: ({ children }: any) => children,
  useServerTimeNow: () => now,
}));

vi.mock('../ui/EgyptianPlate', () => ({
  EgyptianPlate: ({ plateNumber }: { plateNumber: string }) => <span>{plateNumber}</span>,
}));

const makeProps = (minutesSinceEntry = 60) => {
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
    render(<ServerTimeProvider><CheckOutModal {...props} /></ServerTimeProvider>);

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
    render(<ServerTimeProvider><CheckOutModal {...makeProps()} /></ServerTimeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيمن' }));
    expect(screen.getByRole('button', { name: 'تأكيد خروج السيارة ABC 123' })).toBeInTheDocument();
  });

  it('keeps one delete action visible during the five-minute entry-error window', () => {
    const props = makeProps(2);
    render(<ServerTimeProvider><CheckOutModal {...props} /></ServerTimeProvider>);

    screen.getAllByRole('button').forEach((button) => expect(button).toHaveAccessibleName());
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(props.onCancel).toHaveBeenCalledOnce();

    expect(screen.getAllByRole('button', { name: 'امسح العربية (دخول غلط)' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'امسح العربية (دخول غلط)' }));
    expect(props.onDelete).toHaveBeenCalledOnce();
  });

  it('allows a garage owner to delete only a vehicle they entered', () => {
    const props = makeProps(2);
    props.currentStaff = null;
    props.selectedVehicle.staffId = 'garage-1';
    props.selectedVehicle.enteredByEntityId = 'garage-1';
    props.selectedVehicle.enteredByRole = 'garage';
    render(<ServerTimeProvider><CheckOutModal {...props} /></ServerTimeProvider>);

    expect(screen.getByRole('button', { name: 'امسح العربية (دخول غلط)' })).toBeInTheDocument();
  });

  it('hides delete for another staff account and for legacy records without stable entrant metadata', () => {
    const otherStaffProps = makeProps(2);
    otherStaffProps.selectedVehicle.enteredByEntityId = 'staff-2';
    otherStaffProps.selectedVehicle.staffId = 'staff-2';
    const { rerender } = render(<ServerTimeProvider><CheckOutModal {...otherStaffProps} /></ServerTimeProvider>);
    expect(screen.queryByRole('button', { name: 'امسح العربية (دخول غلط)' })).toBeNull();

    const legacyProps = makeProps(2);
    delete legacyProps.selectedVehicle.enteredByEntityId;
    delete legacyProps.selectedVehicle.enteredByRole;
    rerender(<ServerTimeProvider><CheckOutModal {...legacyProps} /></ServerTimeProvider>);
    expect(screen.queryByRole('button', { name: 'امسح العربية (دخول غلط)' })).toBeNull();
  });

  it('hides the delete action after the five-minute entry-error window', () => {
    render(<ServerTimeProvider><CheckOutModal {...makeProps(6)} /></ServerTimeProvider>);

    expect(screen.queryByRole('button', { name: 'امسح العربية (دخول غلط)' })).toBeNull();
  });

  // ── MISTAKE RULE (owner request 2026-11-24) ─────────────────────
  // A just-entered car is a MISTAKE: inside the 5-minute window the modal
  // must NEVER offer a 0-EGP exit — not for another entrant, and not when
  // the 3/day delete budget is spent. The price panel is replaced by a calm
  // wait note; checkout returns only after the window ends.
  it('never offers a 0-EGP exit during the window for a car entered by someone else', () => {
    const props = makeProps(2);
    props.selectedVehicle.enteredByEntityId = 'staff-2';
    props.selectedVehicle.staffId = 'staff-2';
    render(<ServerTimeProvider><CheckOutModal {...props} /></ServerTimeProvider>);

    // No checkout buttons…
    expect(screen.queryByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيسر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيمن' })).toBeNull();
    // …no delete button…
    expect(screen.queryByRole('button', { name: 'امسح العربية (دخول غلط)' })).toBeNull();
    // …no "0" price digits, and the calm wait note instead.
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText(/استنى ٥ دقايق من دخولها/)).toBeInTheDocument();
  });

  it('never offers a 0-EGP exit during the window when the 3/day delete budget is spent', () => {
    const props = makeProps(2);
    props.garage.dailyDeletionCount = 3;
    props.garage.lastDeletionDate = getCairoDateKey(new Date());
    render(<ServerTimeProvider><CheckOutModal {...props} /></ServerTimeProvider>);

    expect(screen.queryByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيمن' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'امسح العربية (دخول غلط)' })).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText(/استنى ٥ دقايق من دخولها/)).toBeInTheDocument();
  });

  it('still shows the big price and checkout buttons after the window ends', () => {
    render(<ServerTimeProvider><CheckOutModal {...makeProps(6)} /></ServerTimeProvider>);

    expect(screen.getByRole('button', { name: 'بدء تأكيد خروج السيارة من الجانب الأيمن' })).toBeInTheDocument();
    expect(screen.queryByText(/استنى ٥ دقايق من دخولها/)).toBeNull();
    // The price panel is back (6 minutes → ceil = 1 hour × rate 10 → ١٠).
    // '١٠' appears in both the price and the rate cell — at least one means
    // the panel rendered; the wait note absence proves it is not the note.
    expect(screen.getAllByText('١٠').length).toBeGreaterThan(0);
  });
});
