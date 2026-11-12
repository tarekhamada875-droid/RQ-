import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationCard } from './RegistrationCard';
import type { Vehicle } from '../../types';

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const INSIDE_VEHICLE: Vehicle = {
  id: 'س5',
  plateNumber: 'س 5',
  plateNumberRaw: 'س5',
  entryTime: new Date() as any,
  type: 'hourly',
  garageId: 'garage-accessibility-test',
  status: 'inside',
} as any;

const renderRegistrationCard = (overrides: Record<string, unknown> = {}) => {
  const props = {
    // PR-U: newPlateNumber/setNewPlateNumber removed — RegistrationCard now
    // owns its own draft state. Tests verify the rendered plate display.
    isInputFocused: false,
    setIsInputFocused: vi.fn(),
    plateInputRef: createRef<HTMLInputElement>(),
    vehicles: [] as Vehicle[],
    garage: { id: 'garage-accessibility-test', hourlyRate: 10, overnightRate: 20 } as any,
    handleCheckIn: vi.fn(),
    onCheckOut: vi.fn(),
    closeKeyboard: vi.fn(),
    inputRef: createRef<HTMLDivElement>(),
    ...overrides,
  };
  const view = render(<RegistrationCard {...props as any} />);
  return { props, view };
};

const typePlateSa5 = () => {
  // Letter key then number key — 'س' + '5' passes isPlateValid (>=1 letter, >=1 number).
  fireEvent.click(screen.getByRole('button', { name: 'حرف س' }));
  fireEvent.click(screen.getByRole('button', { name: 'رقم ٥' }));
  return (screen.getByRole('textbox', { name: 'رقم لوحة السيارة' }) as HTMLInputElement).value;
};

describe('RegistrationCard accessible plate input', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the transparent plate input and describes the custom keyboard', () => {
    renderRegistrationCard();

    const plateInput = screen.getByRole('textbox', { name: 'رقم لوحة السيارة' });
    expect(plateInput).toHaveAttribute('aria-describedby', 'registration-plate-input-description');
    expect(document.getElementById('registration-plate-input-description'))
      .toHaveTextContent('استخدم لوحة المفاتيح الظاهرة لإدخال أحرف وأرقام اللوحة المصرية.');
    expect(plateInput).toHaveAttribute('inputmode', 'none');
  });

  it('keeps the virtual keyboard updating the plate value (PR-U: local state)', () => {
    renderRegistrationCard({ isInputFocused: true });

    // PR-U: newPlateNumber is now local state inside RegistrationCard.
    // Clicking the '١' (Arabic 1) key should update the plate display.
    // The keypad buttons now have aria-labels: "رقم ١" for numbers.
    fireEvent.click(screen.getByRole('button', { name: 'رقم ١' }));

    // The plate input should now contain '1' (Western digit in the DOM input,
    // displayed as ١ in the plate preview via formatArabicDigits).
    const plateInput = screen.getByRole('textbox', { name: 'رقم لوحة السيارة' }) as HTMLInputElement;
    expect(plateInput.value).toBe('1');
  });
});

describe('RegistrationCard already-inside mode (owner report 2026-11-12)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never flips to the red checkout button while a check-in is in flight, even when the vehicles list gains the car mid-submit', async () => {
    // The server response (setVehicles) or the Firestore snapshot can land
    // while the request is still pending. Pre-fix: the typed plate was still
    // in the draft at that moment, so existingVehicleForPlate matched the
    // just-checked-in car and the card flashed the red
    // "السيارة موجودة حالياً بالداخل" checkout button mid-submit.
    let resolveCheckIn!: (value: string | null) => void;
    const handleCheckIn = vi.fn(() => new Promise<string | null>((resolve) => {
      resolveCheckIn = resolve;
    }));
    const { props, view } = renderRegistrationCard({ isInputFocused: true, handleCheckIn });

    const typed = typePlateSa5();
    expect(typed).toBe('س5');
    expect(handleCheckIn).not.toHaveBeenCalled();

    // Accessible name includes the price subtitle: "ساعة١٠ ج.م / ساعة".
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ساعة/ }));
    });
    expect(handleCheckIn).toHaveBeenCalledWith('hourly', 'س5');

    // Mid-submit: the checked-in car shows up in the vehicles list (snapshot
    // or Worker response) while the request is still pending.
    await act(async () => {
      view.rerender(<RegistrationCard {...props} vehicles={[INSIDE_VEHICLE]} /> as any);
    });

    expect(screen.queryByText('إصدار فاتورة خروج')).toBeNull();
    expect(screen.queryByText('السيارة موجودة حالياً بالداخل')).toBeNull();

    // Success: plate stays cleared, no flip after completion either.
    await act(async () => {
      resolveCheckIn(null);
    });
    expect(screen.queryByText('إصدار فاتورة خروج')).toBeNull();
    expect((screen.getByRole('textbox', { name: 'رقم لوحة السيارة' }) as HTMLInputElement).value).toBe('');
  });

  it('still offers the red checkout button when the operator deliberately types a plate that is inside (duplicate check-in prevention)', async () => {
    const onCheckOut = vi.fn();
    renderRegistrationCard({ isInputFocused: true, vehicles: [INSIDE_VEHICLE], onCheckOut });

    typePlateSa5();

    // Accessible name includes the already-inside subtitle.
    const checkoutButton = screen.getByRole('button', { name: /إصدار فاتورة خروج/ });
    expect(screen.getByText('السيارة موجودة حالياً بالداخل')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(checkoutButton);
    });
    expect(onCheckOut).toHaveBeenCalledWith(INSIDE_VEHICLE);
    expect((screen.getByRole('textbox', { name: 'رقم لوحة السيارة' }) as HTMLInputElement).value).toBe('');
  });

  it('restores the typed plate when handleCheckIn returns one (warnings, retryable errors)', async () => {
    const handleCheckIn = vi.fn().mockResolvedValue('س 5');
    renderRegistrationCard({ isInputFocused: true, handleCheckIn });

    typePlateSa5();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ساعة/ }));
    });

    expect((screen.getByRole('textbox', { name: 'رقم لوحة السيارة' }) as HTMLInputElement).value).toBe('س 5');
  });
});
