import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DelegateLoginView } from '../components/auth/DelegateLoginView';
import { LoginView } from '../components/auth/LoginView';

describe('Delegate login entry and PIN-only form', () => {
  it('exposes Delegate sign-in from the regular login screen', () => {
    const onDelegateLogin = vi.fn();

    render(
      <LoginView
        loginPhone=""
        setLoginPhone={vi.fn()}
        handleGarageLogin={vi.fn().mockResolvedValue(undefined)}
        onDelegateLogin={onDelegateLogin}
        isLoading={false}
        closeKeyboard={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'دخول المندوب' }));
    expect(onDelegateLogin).toHaveBeenCalledOnce();
  });

  it('accepts a PIN without asking for a phone number', () => {
    const onLogin = vi.fn();

    render(<DelegateLoginView onLogin={onLogin} isLoading={false} onBack={vi.fn()} />);

    expect(screen.getByText('رمز الدخول (PIN)')).toBeTruthy();
    expect(screen.queryByText('رقم الموبايل')).toBeNull();
    expect(screen.queryByText('01xxxxxxxxx')).toBeNull();

    for (const digit of ['2', '4', '6', '8']) {
      fireEvent.click(screen.getByRole('button', { name: digit }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'دخول للوحة الشحن' }));

    expect(onLogin).toHaveBeenCalledWith('2468');
  });

  it('keeps the return-to-main-login action available', () => {
    const onBack = vi.fn();
    render(<DelegateLoginView onLogin={vi.fn()} isLoading={false} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'العودة للرئيسية' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
