import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession, type SessionContextValue } from './sessionContext';

afterEach(() => cleanup());

const stubSession: SessionContextValue = {
  user: null,
  setUser: vi.fn(),
  isAuthReady: true,
  sessionId: 'test-session-id',
  isSessionReady: true,
  currentStaff: null,
  setCurrentStaff: vi.fn(),
  showLogoutConfirm: false,
  setShowLogoutConfirm: vi.fn(),
  isLoggingOut: false,
  handleLogout: vi.fn(),
  handleInitiateLogout: vi.fn(),
};

function Consumer() {
  const session = useSession();
  return <span data-testid="session-id">{session.sessionId}</span>;
}

describe('SessionContext', () => {
  it('throws when useSession is called outside a SessionProvider', () => {
    // Suppress the expected console.error from React when the throw bubbles up.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useSession())).toThrow(
      'useSession must be used within SessionProvider',
    );
    spy.mockRestore();
  });

  it('returns the provider value when called inside a SessionProvider', () => {
    render(
      <SessionProvider value={stubSession}>
        <Consumer />
      </SessionProvider>,
    );
    expect(screen.getByTestId('session-id').textContent).toBe('test-session-id');
  });

  it('renders children inside the provider tree', () => {
    const children: ReactNode = <div data-testid="child">child</div>;
    render(<SessionProvider value={stubSession}>{children}</SessionProvider>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
