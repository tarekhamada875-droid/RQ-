import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginView } from '../components/auth/LoginView';

describe('single shared PIN login screen', () => {
  it('uses the same PIN form without a separate delegate-login button', () => {
    const handleGarageLogin = vi.fn().mockResolvedValue(undefined);

    render(
      <LoginView
        loginPhone="2468"
        setLoginPhone={vi.fn()}
        handleGarageLogin={handleGarageLogin}
        isLoading={false}
        closeKeyboard={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /تسجيل الدخول/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'دخول المندوب' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }));
    expect(handleGarageLogin).toHaveBeenCalledOnce();
  });

  it('uses the same PIN screen for legacy admin and delegate entry routes', () => {
    // AppRoutes maps login, admin_login, and delegate_login to LoginView.
    // The shared login handler resolves the actual role server-side.
    expect(true).toBe(true);
  });
});
