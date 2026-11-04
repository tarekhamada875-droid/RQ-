import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  NavigationUiProvider,
  useNavigationUi,
  type NavigationUiContextValue,
} from './navigationUiContext';

afterEach(() => cleanup());

const stubNavigationUi: NavigationUiContextValue = {
  isLandscapeMobile: false,
  view: 'login',
  setView: vi.fn(),
  loginPhone: '',
  setLoginPhone: vi.fn(),
  selectedGarageForDetails: null,
  setSelectedGarageForDetails: vi.fn(),
  selectedDelegateForDetails: null,
  setSelectedDelegateForDetails: vi.fn(),
  showDeleteConfirm: false,
  setShowDeleteConfirm: vi.fn(),
  garageDeletionProgress: null,
  showSubscribers: false,
  setShowSubscribers: vi.fn(),
  showToast: vi.fn(),
  closeKeyboard: vi.fn(),
  isOnline: true,
  showOfflineScreen: false,
};

function Consumer() {
  const nav = useNavigationUi();
  return <span data-testid="nav-view">{nav.view}</span>;
}

describe('NavigationUiContext', () => {
  it('throws when useNavigationUi is called outside a NavigationUiProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNavigationUi())).toThrow(
      'useNavigationUi must be used within NavigationUiProvider',
    );
    spy.mockRestore();
  });

  it('returns the provider value when called inside a NavigationUiProvider', () => {
    render(
      <NavigationUiProvider value={stubNavigationUi}>
        <Consumer />
      </NavigationUiProvider>,
    );
    expect(screen.getByTestId('nav-view').textContent).toBe('login');
  });

  it('renders children inside the provider tree', () => {
    const children: ReactNode = <div data-testid="child">child</div>;
    render(<NavigationUiProvider value={stubNavigationUi}>{children}</NavigationUiProvider>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
