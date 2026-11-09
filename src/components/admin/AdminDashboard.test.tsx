import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FormEvent } from 'react';
import { AdminDashboard } from './AdminDashboard';
import { garageDeletionService, garageService } from '../../services';
import { SessionProvider } from '../../hooks/sessionContext';
import type { SessionContextValue } from '../../hooks/sessionContext';

const { deleteGarageWithRecoveryMock, garageDeletionFailureMessageMock } = vi.hoisted(() => ({
  deleteGarageWithRecoveryMock: vi.fn(),
  garageDeletionFailureMessageMock: vi.fn()
}));

vi.mock('../../services', () => { const _svc = {
    getAdminGaragesPage: vi.fn(),
    updateGarage: vi.fn(),
    deleteGarage: vi.fn(),
  }; return { firestoreService: _svc, garageService: _svc, garageDeletionService: _svc, vehicleService: _svc, delegateService: _svc, adminService: _svc, authService: _svc }; });
vi.mock('../../services/garageDeletionService', () => ({
  deleteGarageWithRecovery: deleteGarageWithRecoveryMock,
  garageDeletionFailureMessage: garageDeletionFailureMessageMock
}));

vi.mock('../../hooks/useSystemConfig', () => ({ useSystemConfig: () => null }));
vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', adminLang: 'ar', setAdminLang: vi.fn() }),
}));

vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./AdminNavigationAndViews', () => ({
  AdminNavigationAndViews: ({ activeTab, setActiveTab, displayedGarages, handleApproveGarage, handleRejectGarage, onOpenAddGarage }: any) => (
    <>
      <span data-testid="active-admin-tab">{activeTab}</span>
      <button onClick={() => setActiveTab('garages')}>Open garages</button>
      <button onClick={() => onOpenAddGarage?.()}>Open add garage</button>
      <button onClick={() => void handleApproveGarage({ id: 'pending-1', name: 'Pending Garage' }).catch(() => {})}>
        Approve pending garage
      </button>
      <button onClick={() => void handleRejectGarage({ id: 'pending-1', name: 'Pending Garage' }).catch(() => {})}>
        Reject pending garage
      </button>
      {displayedGarages.map((garage: any) => <div key={garage.id}>{garage.name}</div>)}
    </>
  ),
}));

// PR-G: mock the lazy-loaded admin modals so they render synchronously in tests.
// The lazy import (lazyWithRetry) would otherwise require async chunk loading
// which the synchronous getByPlaceholderText assertions can't wait for.
vi.mock('./AdminAddGarageModal', () => ({
  AdminAddGarageModal: ({ isOpen, garageForm, setGarageForm, pinInput, setPinInput, onSubmit }: any) => {
    if (!isOpen) return null;
    return (
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit?.(e); }}>
        <input placeholder="اسم الجراج..." value={garageForm?.name || ''} onChange={(e) => setGarageForm?.({ ...garageForm, name: e.target.value })} />
        <input placeholder="10 ج.م" value={garageForm?.hourlyRate || ''} onChange={(e) => setGarageForm?.({ ...garageForm, hourlyRate: e.target.value })} />
        <input placeholder="50 ج.م" value={garageForm?.overnightRate || ''} onChange={(e) => setGarageForm?.({ ...garageForm, overnightRate: e.target.value })} />
        <input placeholder="01xxxxxxxxx" value={garageForm?.walletNumber || ''} onChange={(e) => setGarageForm?.({ ...garageForm, walletNumber: e.target.value })} />
        <input placeholder="12345" value={pinInput || ''} onChange={(e) => setPinInput?.(e.target.value)} />
        <button type="submit">Submit</button>
      </form>
    );
  }
}));
vi.mock('./AdminConfirmDialog', () => ({
  AdminConfirmDialog: ({ isOpen, onConfirm, onCancel }: any) => {
    if (!isOpen) return null;
    return (
      <>
        <button onClick={() => void Promise.resolve(onConfirm()).catch(() => {})}>Confirm dialog action</button>
        <button onClick={onCancel}>Cancel</button>
      </>
    );
  }
}));
vi.mock('../modals/AppearanceSettingsModal', () => ({
  AppearanceSettingsModal: ({ onClose }: any) => (
    <div><button onClick={onClose}>Close Appearance</button></div>
  )
}));
vi.mock('./PackageValidationErrorModal', () => ({ PackageValidationErrorModal: () => null }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(garageService.getAdminGaragesPage).mockResolvedValue({
    garages: [],
    lastDoc: null,
    hasMore: false,
  } as any);
  deleteGarageWithRecoveryMock.mockReset();
  garageDeletionFailureMessageMock.mockReset().mockReturnValue('تم إرسال طلبات حذف كثيرة. انتظر دقيقة قبل المحاولة مجدداً.');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockSession: SessionContextValue = {
  user: null,
  setUser: vi.fn(),
  isAuthReady: true,
  sessionId: 'test-session',
  isSessionReady: true,
  currentStaff: null,
  setCurrentStaff: vi.fn(),
  showLogoutConfirm: false,
  setShowLogoutConfirm: vi.fn(),
  isLoggingOut: false,
  handleLogout: vi.fn().mockResolvedValue(undefined),
  handleInitiateLogout: vi.fn(),
};

const renderDashboard = (ui: React.ReactElement) =>
  render(<SessionProvider value={mockSession}>{ui}</SessionProvider>);

const renderDashboardForGarageCreation = (
  createNewGarage: (event: FormEvent<HTMLFormElement>) => Promise<boolean>,
  showToast = vi.fn(),
  onRefreshAdminLists = vi.fn().mockResolvedValue(undefined),
) => {
  renderDashboard(
    <AdminDashboard
      allGarages={[]}
      isLoading={false}
      createNewGarage={createNewGarage}
      setView={vi.fn()}
      setSelectedGarageForDetails={vi.fn()}
      setSelectedDelegateForDetails={vi.fn()}
      delegates={[]}
      showToast={showToast}
      onRefreshAdminLists={onRefreshAdminLists}
    />,
  );
  return showToast;
};

const fillAddGarageDraft = () => {
  // PERF (audit 2026-11-08): FastInput uses a native 'input' event listener,
  // not React's onChange. fireEvent.change fires a React synthetic 'change'
  // event which FastInput doesn't see. We must set the DOM value directly,
  // dispatch a native 'input' event, then blur to trigger onCommit.
  const fill = (placeholder: string, value: string) => {
    const input = screen.getByPlaceholderText(placeholder) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fireEvent.blur(input);
  };
  fill('اسم الجراج...', 'Draft Garage');
  fill('10 ج.م', '25');
  fill('50 ج.م', '60');
  fill('01xxxxxxxxx', '01012345678');
  fill('12345', '12345');
};

const submitAddGarageDraft = () => {
  const form = screen.getByPlaceholderText('اسم الجراج...').closest('form');
  if (!form) throw new Error('Add garage form was not rendered');
  fireEvent.submit(form);
};

it('keeps the Admin interface right-to-left', () => {
  renderDashboard(
    <AdminDashboard
      allGarages={[]}
      isLoading={false}
      createNewGarage={vi.fn().mockResolvedValue(true)}
      setView={vi.fn()}
      setSelectedGarageForDetails={vi.fn()}
      setSelectedDelegateForDetails={vi.fn()}
      delegates={[]}
    />,
  );

  expect(document.querySelector('.admin-custom-theme')).toHaveAttribute('dir', 'rtl');
});

it('resets a saved retired trial leads tab to Garages without touching other saved data', async () => {
  localStorage.setItem('app_admin_tab', 'trial_leads');
  localStorage.setItem('unrelated-setting', 'keep-me');

  renderDashboard(
    <AdminDashboard
      allGarages={[]}
      isLoading={false}
      createNewGarage={vi.fn().mockResolvedValue(true)}
      setView={vi.fn()}
      setSelectedGarageForDetails={vi.fn()}
      setSelectedDelegateForDetails={vi.fn()}
      delegates={[]}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('active-admin-tab')).toHaveTextContent('garages');
    expect(localStorage.getItem('app_admin_tab')).toBe('garages');
  });
  expect(localStorage.getItem('unrelated-setting')).toBe('keep-me');
});

describe('AdminDashboard garage actions', () => {
  it('does not fetch a second garage page when opening the garage tab', async () => {
    renderDashboard(
      <AdminDashboard
        allGarages={[{ id: 'garage-1', name: 'Already loaded garage' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open garages' }));

    expect(await screen.findByText('Already loaded garage')).toBeInTheDocument();
    expect(garageService.getAdminGaragesPage).not.toHaveBeenCalled();
  });

  it('preserves every add-garage draft value when creation returns false', async () => {
    const createNewGarage = vi.fn().mockResolvedValue(false);
    renderDashboardForGarageCreation(createNewGarage);

    fireEvent.click(screen.getByRole('button', { name: 'Open add garage' }));
    fillAddGarageDraft();
    submitAddGarageDraft();

    await waitFor(() => expect(createNewGarage).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText('اسم الجراج...')).toHaveValue('Draft Garage');
    expect(screen.getByPlaceholderText('10 ج.م')).toHaveValue('25');
    expect(screen.getByPlaceholderText('50 ج.م')).toHaveValue('60');
    expect(screen.getByPlaceholderText('01xxxxxxxxx')).toHaveValue('01012345678');
    expect(screen.getByPlaceholderText('12345')).toHaveValue('12345');
  });

  it('closes and clears the add-garage draft only after successful creation', async () => {
    const createNewGarage = vi.fn().mockResolvedValue(true);
    const onRefreshAdminLists = vi.fn().mockResolvedValue(undefined);
    renderDashboardForGarageCreation(createNewGarage, vi.fn(), onRefreshAdminLists);

    fireEvent.click(screen.getByRole('button', { name: 'Open add garage' }));
    fillAddGarageDraft();
    submitAddGarageDraft();

    await waitFor(() => expect(screen.queryByPlaceholderText('اسم الجراج...')).not.toBeInTheDocument());
    expect(createNewGarage).toHaveBeenCalledTimes(1);
    expect(onRefreshAdminLists).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Open add garage' }));
    expect(screen.getByPlaceholderText('اسم الجراج...')).toHaveValue('');
    expect(screen.getByPlaceholderText('10 ج.م')).toHaveValue('');
    expect(screen.getByPlaceholderText('50 ج.م')).toHaveValue('');
    expect(screen.getByPlaceholderText('01xxxxxxxxx')).toHaveValue('');
    expect(screen.getByPlaceholderText('12345')).toHaveValue('');
  });

  it('keeps the add-garage draft open and reports an unexpected rejected create request', async () => {
    const createNewGarage = vi.fn().mockRejectedValue(new Error('temporary failure'));
    const showToast = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDashboardForGarageCreation(createNewGarage, showToast);

    fireEvent.click(screen.getByRole('button', { name: 'Open add garage' }));
    fillAddGarageDraft();
    submitAddGarageDraft();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('temporary failure', 'error'));
    expect(screen.getByPlaceholderText('اسم الجراج...')).toHaveValue('Draft Garage');
    expect(screen.getByPlaceholderText('10 ج.م')).toHaveValue('25');
    expect(screen.getByPlaceholderText('50 ج.م')).toHaveValue('60');
    expect(screen.getByPlaceholderText('01xxxxxxxxx')).toHaveValue('01012345678');
    expect(screen.getByPlaceholderText('12345')).toHaveValue('12345');
  });

  it('refreshes paginated Admin lists after a successful garage approval', async () => {
    const onRefreshAdminLists = vi.fn().mockResolvedValue(undefined);
    renderDashboard(
      <AdminDashboard
        allGarages={[{ id: 'pending-1', name: 'Pending Garage', status: 'pending' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
        onRefreshAdminLists={onRefreshAdminLists}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve pending garage' }));

    await waitFor(() => expect(onRefreshAdminLists).toHaveBeenCalledOnce());
    expect(garageService.updateGarage).toHaveBeenCalledWith('pending-1', { status: 'approved' });
  });

  it('refreshes paginated Admin lists after a successful pending-garage rejection', async () => {
    deleteGarageWithRecoveryMock.mockResolvedValue({ ok: true });
    const onRefreshAdminLists = vi.fn().mockResolvedValue(undefined);
    renderDashboard(
      <AdminDashboard
        allGarages={[{ id: 'pending-1', name: 'Pending Garage', status: 'pending' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
        onRefreshAdminLists={onRefreshAdminLists}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reject pending garage' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm dialog action' }));

    await waitFor(() => expect(onRefreshAdminLists).toHaveBeenCalledOnce());
    expect(deleteGarageWithRecoveryMock).toHaveBeenCalledWith('pending-1');
  });

  it('routes pending-garage rejection through shared deletion handling and reports a real failure', async () => {
    deleteGarageWithRecoveryMock.mockResolvedValue({
      ok: false,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      status: null,
      error: new Error('RATE_LIMIT_EXCEEDED')
    });
    const showToast = vi.fn();
    renderDashboard(
      <AdminDashboard
        allGarages={[{ id: 'pending-1', name: 'Pending Garage' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
      showToast={showToast}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reject pending garage' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm dialog action' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('تم إرسال طلبات حذف كثيرة. انتظر دقيقة قبل المحاولة مجدداً.', 'error'));
    expect(deleteGarageWithRecoveryMock).toHaveBeenCalledWith('pending-1');
    expect(garageDeletionService.deleteGarage).not.toHaveBeenCalled();
  });
});
