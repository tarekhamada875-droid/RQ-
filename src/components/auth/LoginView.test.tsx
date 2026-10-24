import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginView } from './LoginView';

afterEach(() => cleanup());

function renderLogin(overrides: Partial<React.ComponentProps<typeof LoginView>> = {}) {
  const props: React.ComponentProps<typeof LoginView> = {
    loginPhone: '',
    setLoginPhone: vi.fn(),
    handleGarageLogin: vi.fn(),
    isLoading: false,
    closeKeyboard: vi.fn(),
    ...overrides,
  };
  return { ...render(<LoginView {...props} />), props };
}

describe('LoginView safe interaction contract', () => {
  it('builds a numeric PIN through keypad clicks and respects the ten-digit limit', () => {
    const setLoginPhone = vi.fn();
    renderLogin({ setLoginPhone });

    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));

    expect(setLoginPhone).toHaveBeenNthCalledWith(1, '1');
    expect(setLoginPhone).toHaveBeenNthCalledWith(2, '2');
    expect(setLoginPhone).toHaveBeenNthCalledWith(3, '0');

    const atLimit = vi.fn();
    cleanup();
    renderLogin({ loginPhone: '1234567890', setLoginPhone: atLimit });
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(atLimit).not.toHaveBeenCalled();
  });

  it('clears and deletes only the displayed PIN digits', () => {
    const setLoginPhone = vi.fn();
    renderLogin({ loginPhone: '12345', setLoginPhone });

    // The delete key follows 1–9, clear-all, and zero.
    fireEvent.click(screen.getAllByRole('button')[11]);
    expect(setLoginPhone).toHaveBeenCalledWith('1234');

    fireEvent.click(screen.getByRole('button', { name: 'مسح الكل' }));
    expect(setLoginPhone).toHaveBeenCalledWith('');
  });

  it('keeps login and delegate navigation actions separate', () => {
    const handleGarageLogin = vi.fn();
    renderLogin({ loginPhone: '1234567890', handleGarageLogin });

    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }));

    expect(handleGarageLogin).toHaveBeenCalledTimes(1);
  });

  it('does not submit or mutate the PIN while loading', () => {
    const setLoginPhone = vi.fn();
    const handleGarageLogin = vi.fn();
    renderLogin({ loginPhone: '123', setLoginPhone, handleGarageLogin, isLoading: true });

    fireEvent.click(screen.getByRole('button', { name: '4' }));
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[12]);
    fireEvent.click(buttons[13]);

    expect(setLoginPhone).not.toHaveBeenCalled();
    expect(handleGarageLogin).not.toHaveBeenCalled();
  });
});
