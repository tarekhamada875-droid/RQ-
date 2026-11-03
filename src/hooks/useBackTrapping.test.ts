import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBackTrapping } from './useBackTrapping';

function renderBackTrapping(props: any) {
  const { rerender } = renderHook(({ props }) => useBackTrapping(props), {
    initialProps: { props },
  });
  return {
    rerender: (newProps: any) => rerender({ props: newProps }),
    fireBack: () => {
      const event = new PopStateEvent('popstate');
      window.dispatchEvent(event);
    },
  };
}

describe('useBackTrapping priority', () => {
  beforeEach(() => {
    // Reset history state between tests
    window.history.replaceState({}, '');
  });

  it('closes check-out modal first (most in-progress)', () => {
    const setShowCheckOutModal = vi.fn();
    const setShowCheckInModal = vi.fn();
    const props = {
      view: 'garage',
      setView: vi.fn(),
      showCheckInModal: true,
      setShowCheckInModal,
      showCheckOutModal: true,
      setShowCheckOutModal,
      showDeleteConfirm: false,
      setShowDeleteConfirm: vi.fn(),
      showLogoutConfirm: false,
      setShowLogoutConfirm: vi.fn(),
      showRecentExitWarning: false,
      setShowRecentExitWarning: vi.fn(),
      showSubscriberWarning: false,
      setShowSubscriberWarning: vi.fn(),
      showSubscribers: false,
      setShowSubscribers: vi.fn(),
      setSelectedVehicle: vi.fn(),
      setSelectedGarageForDetails: vi.fn(),
      setSelectedDelegateForDetails: vi.fn(),
      setRecentVehicle: vi.fn(),
      setSubscriberWarningPlate: vi.fn(),
      garageBackHandlerRef: { current: null },
    };
    const { fireBack } = renderBackTrapping(props);
    fireBack();
    expect(setShowCheckOutModal).toHaveBeenCalledWith(false);
    expect(setShowCheckInModal).not.toHaveBeenCalled();
  });

  it('shows logout confirm when on main dashboard with nothing open', () => {
    const setShowLogoutConfirm = vi.fn();
    const props = {
      view: 'garage',
      setView: vi.fn(),
      showCheckInModal: false,
      setShowCheckInModal: vi.fn(),
      showCheckOutModal: false,
      setShowCheckOutModal: vi.fn(),
      showDeleteConfirm: false,
      setShowDeleteConfirm: vi.fn(),
      showLogoutConfirm: false,
      setShowLogoutConfirm,
      showRecentExitWarning: false,
      setShowRecentExitWarning: vi.fn(),
      showSubscriberWarning: false,
      setShowSubscriberWarning: vi.fn(),
      showSubscribers: false,
      setShowSubscribers: vi.fn(),
      setSelectedVehicle: vi.fn(),
      setSelectedGarageForDetails: vi.fn(),
      setSelectedDelegateForDetails: vi.fn(),
      setRecentVehicle: vi.fn(),
      setSubscriberWarningPlate: vi.fn(),
      garageBackHandlerRef: { current: null },
    };
    const { fireBack } = renderBackTrapping(props);
    fireBack();
    expect(setShowLogoutConfirm).toHaveBeenCalledWith(true);
  });

  it('navigates to admin_dashboard from admin_garage_details', () => {
    const setView = vi.fn();
    const setSelectedGarageForDetails = vi.fn();
    const props = {
      view: 'admin_garage_details',
      setView,
      showCheckInModal: false,
      setShowCheckInModal: vi.fn(),
      showCheckOutModal: false,
      setShowCheckOutModal: vi.fn(),
      showDeleteConfirm: false,
      setShowDeleteConfirm: vi.fn(),
      showLogoutConfirm: false,
      setShowLogoutConfirm: vi.fn(),
      showRecentExitWarning: false,
      setShowRecentExitWarning: vi.fn(),
      showSubscriberWarning: false,
      setShowSubscriberWarning: vi.fn(),
      showSubscribers: false,
      setShowSubscribers: vi.fn(),
      setSelectedVehicle: vi.fn(),
      setSelectedGarageForDetails,
      setSelectedDelegateForDetails: vi.fn(),
      setRecentVehicle: vi.fn(),
      setSubscriberWarningPlate: vi.fn(),
      garageBackHandlerRef: { current: null },
    };
    const { fireBack } = renderBackTrapping(props);
    fireBack();
    expect(setView).toHaveBeenCalledWith('admin_dashboard');
    expect(setSelectedGarageForDetails).toHaveBeenCalledWith(null);
  });

  it('calls garage back handler for garage-level overlays', () => {
    const garageHandler = vi.fn(() => true);
    const props = {
      view: 'garage',
      setView: vi.fn(),
      showCheckInModal: false,
      setShowCheckInModal: vi.fn(),
      showCheckOutModal: false,
      setShowCheckOutModal: vi.fn(),
      showDeleteConfirm: false,
      setShowDeleteConfirm: vi.fn(),
      showLogoutConfirm: false,
      setShowLogoutConfirm: vi.fn(),
      showRecentExitWarning: false,
      setShowRecentExitWarning: vi.fn(),
      showSubscriberWarning: false,
      setShowSubscriberWarning: vi.fn(),
      showSubscribers: false,
      setShowSubscribers: vi.fn(),
      setSelectedVehicle: vi.fn(),
      setSelectedGarageForDetails: vi.fn(),
      setSelectedDelegateForDetails: vi.fn(),
      setRecentVehicle: vi.fn(),
      setSubscriberWarningPlate: vi.fn(),
      garageBackHandlerRef: { current: garageHandler },
    };
    const { fireBack } = renderBackTrapping(props);
    fireBack();
    expect(garageHandler).toHaveBeenCalled();
  });

  it('does nothing on login screen (does not exit)', () => {
    const setView = vi.fn();
    const setShowLogoutConfirm = vi.fn();
    const props = {
      view: 'login',
      setView,
      showCheckInModal: false,
      setShowCheckInModal: vi.fn(),
      showCheckOutModal: false,
      setShowCheckOutModal: vi.fn(),
      showDeleteConfirm: false,
      setShowDeleteConfirm: vi.fn(),
      showLogoutConfirm: false,
      setShowLogoutConfirm,
      showRecentExitWarning: false,
      setShowRecentExitWarning: vi.fn(),
      showSubscriberWarning: false,
      setShowSubscriberWarning: vi.fn(),
      showSubscribers: false,
      setShowSubscribers: vi.fn(),
      setSelectedVehicle: vi.fn(),
      setSelectedGarageForDetails: vi.fn(),
      setSelectedDelegateForDetails: vi.fn(),
      setRecentVehicle: vi.fn(),
      setSubscriberWarningPlate: vi.fn(),
      garageBackHandlerRef: { current: null },
    };
    const { fireBack } = renderBackTrapping(props);
    fireBack();
    expect(setView).not.toHaveBeenCalled();
    expect(setShowLogoutConfirm).not.toHaveBeenCalled();
  });
});
