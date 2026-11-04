import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { BackHandlerProvider, useBackHandler } from './backHandler';
import { useBackTrapping } from './useBackTrapping';
import type { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return <BackHandlerProvider>{children}</BackHandlerProvider>;
}

function renderBackTrapping(props: any) {
  const { rerender } = renderHook(({ props }) => useBackTrapping(props), {
    initialProps: { props },
    wrapper,
  });
  return {
    rerender: (newProps: any) => rerender({ props: newProps }),
    fireBack: () => {
      const event = new PopStateEvent('popstate');
      window.dispatchEvent(event);
    },
  };
}

describe('useBackTrapping fallback (no registered handlers)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '');
  });

  it('shows logout confirm when on main dashboard with nothing open', () => {
    const setShowLogoutConfirm = vi.fn();
    const { fireBack } = renderBackTrapping({
      view: 'garage',
      setView: vi.fn(),
      showLogoutConfirm: false,
      setShowLogoutConfirm,
      setSelectedGarageForDetails: vi.fn(),
      setSelectedDelegateForDetails: vi.fn(),
    });
    fireBack();
    expect(setShowLogoutConfirm).toHaveBeenCalledWith(true);
  });

  it('navigates to admin_dashboard from admin_garage_details', () => {
    const setView = vi.fn();
    const setSelectedGarageForDetails = vi.fn();
    const { fireBack } = renderBackTrapping({
      view: 'admin_garage_details',
      setView,
      showLogoutConfirm: false,
      setShowLogoutConfirm: vi.fn(),
      setSelectedGarageForDetails,
      setSelectedDelegateForDetails: vi.fn(),
    });
    fireBack();
    expect(setView).toHaveBeenCalledWith('admin_dashboard');
    expect(setSelectedGarageForDetails).toHaveBeenCalledWith(null);
  });

  it('does nothing on login screen (does not exit)', () => {
    const setView = vi.fn();
    const setShowLogoutConfirm = vi.fn();
    const { fireBack } = renderBackTrapping({
      view: 'login',
      setView,
      showLogoutConfirm: false,
      setShowLogoutConfirm,
      setSelectedGarageForDetails: vi.fn(),
      setSelectedDelegateForDetails: vi.fn(),
    });
    fireBack();
    expect(setView).not.toHaveBeenCalled();
    expect(setShowLogoutConfirm).not.toHaveBeenCalled();
  });
});

describe('useBackHandler stack', () => {
  it('registered handler fires before fallback', () => {
    const setShowModal = vi.fn();
    const setShowLogoutConfirm = vi.fn();

    // Render both hooks inside the SAME provider so they share the stack.
    const { result } = renderHook(() => {
      useBackHandler(() => { setShowModal(false); return true; }, true);
      useBackTrapping({
        view: 'garage',
        setView: vi.fn(),
        showLogoutConfirm: false,
        setShowLogoutConfirm,
        setSelectedGarageForDetails: vi.fn(),
        setSelectedDelegateForDetails: vi.fn(),
      });
    }, { wrapper });

    void result;
    const event = new PopStateEvent('popstate');
    window.dispatchEvent(event);

    expect(setShowModal).toHaveBeenCalledWith(false);
    expect(setShowLogoutConfirm).not.toHaveBeenCalled();
  });

  it('most recently registered handler wins (stack top)', () => {
    const closeFirst = vi.fn(() => true);
    const closeSecond = vi.fn(() => true);

    const { result } = renderHook(() => {
      useBackHandler(closeFirst, true);
      useBackHandler(closeSecond, true);
      useBackTrapping({
        view: 'garage',
        setView: vi.fn(),
        showLogoutConfirm: false,
        setShowLogoutConfirm: vi.fn(),
        setSelectedGarageForDetails: vi.fn(),
        setSelectedDelegateForDetails: vi.fn(),
      });
    }, { wrapper });

    void result;
    const event = new PopStateEvent('popstate');
    window.dispatchEvent(event);

    expect(closeSecond).toHaveBeenCalled();
    expect(closeFirst).not.toHaveBeenCalled();
  });

  it('inactive handler is not called', () => {
    const closeInactive = vi.fn(() => true);

    const { result } = renderHook(() => {
      useBackHandler(closeInactive, false);
      useBackTrapping({
        view: 'garage',
        setView: vi.fn(),
        showLogoutConfirm: false,
        setShowLogoutConfirm: vi.fn(),
        setSelectedGarageForDetails: vi.fn(),
        setSelectedDelegateForDetails: vi.fn(),
      });
    }, { wrapper });

    void result;
    const event = new PopStateEvent('popstate');
    window.dispatchEvent(event);

    expect(closeInactive).not.toHaveBeenCalled();
  });
});
