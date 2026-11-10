import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationCard } from './RegistrationCard';

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const renderRegistrationCard = (overrides: Record<string, unknown> = {}) => {
  const props = {
    // PR-U: newPlateNumber/setNewPlateNumber removed — RegistrationCard now
    // owns its own draft state. Tests verify the rendered plate display.
    isInputFocused: false,
    setIsInputFocused: vi.fn(),
    plateInputRef: createRef<HTMLInputElement>(),
    vehicles: [],
    garage: { id: 'garage-accessibility-test', hourlyRate: 10, overnightRate: 20 } as any,
    handleCheckIn: vi.fn(),
    onCheckOut: vi.fn(),
    closeKeyboard: vi.fn(),
    inputRef: createRef<HTMLDivElement>(),
    ...overrides,
  };
  render(<RegistrationCard {...props as any} />);
  return props;
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
    // The plate preview shows Arabic-Indic digits via formatArabicDigits.
    fireEvent.click(screen.getByRole('button', { name: '١' }));

    // The plate input should now contain '1' (Western digit in the DOM input,
    // displayed as ١ in the plate preview via formatArabicDigits).
    const plateInput = screen.getByRole('textbox', { name: 'رقم لوحة السيارة' }) as HTMLInputElement;
    expect(plateInput.value).toBe('1');
  });
});
