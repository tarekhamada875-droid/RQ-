import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationCard } from './RegistrationCard';
import type { Vehicle } from '../../types';

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const serviceMocks = vi.hoisted(() => ({
  getVehicleDocOnce: vi.fn(),
}));

vi.mock('../../services', () => {
  const _svc = {
    getVehicleDocOnce: serviceMocks.getVehicleDocOnce,
  };
  return { garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc };
});

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
    isInputFocused: false,
    setIsInputFocused: vi.fn(),
    plateInputRef: createRef<HTMLInputElement>(),
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

// Pure-button keypad: no <input> element. The plate display is a div with
// role="textbox". Tests verify the rendered text content, not input.value.
const getPlateText = () => {
  const plateDisplay = screen.getByRole('textbox', { name: 'رقم لوحة السيارة' });
  return plateDisplay.textContent || '';
};

const typePlateSa5 = () => {
  fireEvent.click(screen.getByRole('button', { name: 'حرف س' }));
  fireEvent.click(screen.getByRole('button', { name: 'رقم ٥' }));
  return getPlateText();
};

describe('RegistrationCard accessible plate input', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    // Default: the garage has never seen this plate (no doc).
    serviceMocks.getVehicleDocOnce.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the plate display and describes the custom keyboard', () => {
    renderRegistrationCard();

    const plateDisplay = screen.getByRole('textbox', { name: 'رقم لوحة السيارة' });
    expect(plateDisplay).toHaveAttribute('aria-describedby', 'registration-plate-input-description');
    expect(document.getElementById('registration-plate-input-description'))
      .toHaveTextContent('استخدم لوحة المفاتيح الظاهرة لإدخال أحرف وأرقام اللوحة المصرية.');
  });

  it('keeps the virtual keyboard updating the plate value (pure button state)', () => {
    renderRegistrationCard({ isInputFocused: true });

    fireEvent.click(screen.getByRole('button', { name: 'رقم ١' }));

    // The plate display should now contain '1' (rendered as ١ via formatArabicDigits).
    const plateText = getPlateText();
    expect(plateText).toContain('١');
  });
});

describe('RegistrationCard already-inside mode (server lookup, PR2 2026-11-23)', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    serviceMocks.getVehicleDocOnce.mockReset();
    serviceMocks.getVehicleDocOnce.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never flips to the red checkout button while a check-in is in flight', async () => {
    let resolveCheckIn!: (value: string | null) => void;
    const handleCheckIn = vi.fn(() => new Promise<string | null>((resolve) => {
      resolveCheckIn = resolve;
    }));
    const { view } = renderRegistrationCard({ isInputFocused: true, handleCheckIn });

    const typed = typePlateSa5();
    expect(typed).toContain('س');
    expect(typed).toContain('٥');
    expect(handleCheckIn).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ساعة/ }));
    });
    expect(handleCheckIn).toHaveBeenCalledWith('hourly', expect.stringContaining('س'));

    // PR-U regression guard, adapted to the server-lookup world: the draft is
    // cleared at submit start, so no late lookup response can flip the action
    // area to the red checkout button mid-submit. (Previously this test
    // simulated the streamed vehicles list gaining the car mid-submit.)
    view.rerender(<RegistrationCard
      isInputFocused={true}
      setIsInputFocused={vi.fn()}
      plateInputRef={createRef<HTMLInputElement>()}
      garage={{ id: 'garage-accessibility-test', hourlyRate: 10, overnightRate: 20 } as any}
      handleCheckIn={handleCheckIn}
      onCheckOut={vi.fn()}
      closeKeyboard={vi.fn()}
      inputRef={createRef<HTMLDivElement>()}
    /> as any);

    expect(screen.queryByText('إصدار فاتورة خروج')).toBeNull();
    expect(screen.queryByText('السيارة موجودة حالياً بالداخل')).toBeNull();

    await act(async () => {
      resolveCheckIn(null);
    });
    expect(screen.queryByText('إصدار فاتورة خروج')).toBeNull();
    expect(getPlateText()).toBe('');
  });

  it('offers the red checkout button when the server says the typed plate is inside', async () => {
    const onCheckOut = vi.fn();
    serviceMocks.getVehicleDocOnce.mockResolvedValue(INSIDE_VEHICLE);
    renderRegistrationCard({ isInputFocused: true, onCheckOut });

    typePlateSa5();

    // The lookup is debounced 250ms, then the red button renders.
    const checkoutButton = await screen.findByRole('button', { name: /إصدار فاتورة خروج/ });
    expect(screen.getByText('السيارة موجودة حالياً بالداخل')).toBeInTheDocument();
    // The lookup hit the server exactly once with the normalized plate.
    expect(serviceMocks.getVehicleDocOnce).toHaveBeenCalledWith('garage-accessibility-test', 'س5');

    await act(async () => {
      fireEvent.click(checkoutButton);
    });
    expect(onCheckOut).toHaveBeenCalledWith(INSIDE_VEHICLE);
    expect(getPlateText()).toBe('');
  });

  it('shows the ساعة/مبيت buttons when the server has no inside car for the typed plate', async () => {
    renderRegistrationCard({ isInputFocused: true });

    typePlateSa5();

    await waitFor(() => {
      expect(serviceMocks.getVehicleDocOnce).toHaveBeenCalled();
    });
    // No doc for this plate → check-in buttons stay (never the red button).
    expect(screen.queryByText('إصدار فاتورة خروج')).toBeNull();
    expect(screen.getByRole('button', { name: /^ساعة/ })).toBeInTheDocument();
  });

  it('restores the typed plate when handleCheckIn returns one (warnings, retryable errors)', async () => {
    const handleCheckIn = vi.fn().mockResolvedValue('س 5');
    renderRegistrationCard({ isInputFocused: true, handleCheckIn });

    typePlateSa5();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^ساعة/ }));
    });

    expect(getPlateText()).toContain('س');
  });
});
