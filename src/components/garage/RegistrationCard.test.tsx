import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationCard } from './RegistrationCard';

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

const renderRegistrationCard = (overrides: Record<string, unknown> = {}) => {
  const props = {
    newPlateNumber: '',
    setNewPlateNumber: vi.fn(),
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

  it('keeps the virtual keyboard updating the plate value', () => {
    const setNewPlateNumber = vi.fn();
    renderRegistrationCard({ isInputFocused: true, setNewPlateNumber });

    fireEvent.click(screen.getByRole('button', { name: '1' }));

    expect(setNewPlateNumber).toHaveBeenCalledWith('1');
  });
});
