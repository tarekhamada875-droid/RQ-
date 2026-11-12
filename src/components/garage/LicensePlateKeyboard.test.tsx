import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LicensePlateKeyboard } from './LicensePlateKeyboard';

describe('LicensePlateKeyboard interaction styling', () => {
  it('keeps selected-key color feedback without motion or shadows', () => {
    render(<LicensePlateKeyboard onKeyPress={vi.fn()} currentValue="أ" />);

    const selectedKey = screen.getByRole('button', { name: 'حرف أ' });
    expect(selectedKey.className).toContain('bg-emerald-600');
    expect(selectedKey.className).toContain('text-white');
    expect(selectedKey.className).not.toMatch(/transition|scale-|shadow-/);
  });

  it('keeps press color feedback without an animated or scaled press effect', () => {
    render(<LicensePlateKeyboard onKeyPress={vi.fn()} currentValue="" />);

    const key = screen.getByRole('button', { name: 'حرف ب' });
    expect(key.className).toContain('active:bg-slate-100');
    expect(key.className).toContain('dark:active:bg-slate-700');
    expect(key.className).not.toMatch(/transition|scale-|shadow-/);
  });

  it('still sends the pressed character to the parent', () => {
    const onKeyPress = vi.fn();
    render(<LicensePlateKeyboard onKeyPress={onKeyPress} currentValue="" />);

    fireEvent.click(screen.getByRole('button', { name: 'حرف ب' }));

    expect(onKeyPress).toHaveBeenCalledWith('ب');
  });
});
