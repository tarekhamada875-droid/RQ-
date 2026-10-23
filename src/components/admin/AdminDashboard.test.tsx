import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FormEvent } from 'react';
import { AdminDashboard } from './AdminDashboard';
import { firestoreService } from '../../services';

const { deleteGarageWithRecoveryMock, garageDeletionFailureMessageMock } = vi.hoisted(() => ({
  deleteGarageWithRecoveryMock: vi.fn(),
  garageDeletionFailureMessageMock: vi.fn()
}));

vi.mock('../../services', () => ({
  firestoreService: {
    getAdminGaragesPage: vi.fn(),
    updateGarage: vi.fn(),
    deleteGarage: vi.fn(),
  },
}));
vi.mock('../../services/garageDeletionService', () => ({
  deleteGarageWithRecovery: deleteGarageWithRecoveryMock,
  garageDeletionFailureMessage: garageDeletionFailureMessageMock
}));

vi.mock('../../hooks/useSystemConfig', () => ({ useSystemConfig: () => null }));
vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', adminLang: 'ar', setAdminLang: vi.fn() }),
}));
vi.mock('../../utils/adminTranslations', () => ({
  useAdminTranslation: () => (key: string) => key,
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
vi.mock('./PackageValidationErrorModal', () => ({ PackageValidationErrorModal: () => null }));
vi.mock('./AdminConfirmDialog', () => ({
  AdminConfirmDialog: ({ isOpen, onConfirm }: any) => isOpen
    ? <button onClick={() => void Promise.resolve(onConfirm()).catch(() => {})}>Confirm dialog action</button>
    : null
}));
vi.mock('../modals/AppearanceSettingsModal', () => ({ AppearanceSettingsModal: () => null }));
vi.mock('./AdminGarageList', () => ({ AdminGarageList: () => null }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(firestoreService.getAdminGaragesPage).mockResolvedValue({
    garages: [],
    lastDoc: null,
    hasMore: false,
  } as any);
  deleteGarageWithRecoveryMock.mockReset();
  garageDeletionFailureMessageMock.mockReset().mockReturnValue('Too many delete requests; wait before retrying.');
});

afterEach(() => {
  vi.restoreAllMocks();
});

const renderDashboardForGarageCreation = (
  createNewGarage: (event: FormEvent<HTMLFormElement>) => Promise<boolean>,
  showToast = vi.fn(),
  onRefreshAdminLists = vi.fn().mockResolvedValue(undefined),
) => {
  render(
    <AdminDashboard
      allGarages={[]}
      isLoading={false}
      createNewGarage={createNewGarage}
      setView={vi.fn()}
      setSelectedGarageForDetails={vi.fn()}
      setSelectedDelegateForDetails={vi.fn()}
      delegates={[]}
      packages={[]}
      onLogout={vi.fn()}
      currentAdminPin=""
      showToast={showToast}
      onRefreshAdminLists={onRefreshAdminLists}
    />,
  );
  return showToast;
};

const fillAddGarageDraft = () => {
  fireEvent.change(screen.getByPlaceholderText('اسم الجراج...'), { target: { value: 'Draft Garage' } });
  fireEvent.change(screen.getByPlaceholderText('10'), { target: { value: '25' } });
  fireEvent.change(screen.getByPlaceholderText('50'), { target: { value: '60' } });
  fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01012345678' } });
  fireEvent.change(screen.getByPlaceholderText('12345678'), { target: { value: '12345678' } });
  fireEvent.click(screen.getByRole('switch'));
};

const submitAddGarageDraft = () => {
  const form = screen.getByPlaceholderText('اسم الجراج...').closest('form');
  if (!form) throw new Error('Add garage form was not rendered');
  fireEvent.submit(form);
};

it('keeps the Admin interface right-to-left regardless of language preference', () => {
  render(
    <AdminDashboard
      allGarages={[]}
      isLoading={false}
      createNewGarage={vi.fn().mockResolvedValue(true)}
      setView={vi.fn()}
      setSelectedGarageForDetails={vi.fn()}
      setSelectedDelegateForDetails={vi.fn()}
      delegates={[]}
      packages={[]}
      onLogout={vi.fn()}
      currentAdminPin=""
    />,
  );

  expect(document.querySelector('.admin-custom-theme')).toHaveAttribute('dir', 'rtl');
});

it('resets a saved retired trial leads tab to Overview without touching other saved data', async () => {
  localStorage.setItem('app_admin_tab', 'trial_leads');
  localStorage.setItem('unrelated-setting', 'keep-me');

  render(
    <AdminDashboard
      allGarages={[]}
      isLoading={false}
      createNewGarage={vi.fn().mockResolvedValue(true)}
      setView={vi.fn()}
      setSelectedGarageForDetails={vi.fn()}
      setSelectedDelegateForDetails={vi.fn()}
      delegates={[]}
      packages={[]}
      onLogout={vi.fn()}
      currentAdminPin=""
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('active-admin-tab')).toHaveTextContent('overview');
    expect(localStorage.getItem('app_admin_tab')).toBe('overview');
  });
  expect(localStorage.getItem('unrelated-setting')).toBe('keep-me');
});

describe('AdminDashboard garage actions', () => {
  it('does not fetch a second garage page when opening the garage tab', async () => {
    render(
      <AdminDashboard
        allGarages={[{ id: 'garage-1', name: 'Already loaded garage' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
        packages={[]}
        onLogout={vi.fn()}
          currentAdminPin=""
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open garages' }));

    expect(await screen.findByText('Already loaded garage')).toBeInTheDocument();
    expect(firestoreService.getAdminGaragesPage).not.toHaveBeenCalled();
  });

  it('preserves every add-garage draft value when creation returns false', async () => {
    const createNewGarage = vi.fn().mockResolvedValue(false);
    renderDashboardForGarageCreation(createNewGarage);

    fireEvent.click(screen.getByRole('button', { name: 'Open add garage' }));
    fillAddGarageDraft();
    submitAddGarageDraft();

    await waitFor(() => expect(createNewGarage).toHaveBeenCalledTimes(1));
    expect(screen.getByPlaceholderText('اسم الجراج...')).toHaveValue('Draft Garage');
    expect(screen.getByPlaceholderText('10')).toHaveValue('25');
    expect(screen.getByPlaceholderText('50')).toHaveValue('60');
    expect(screen.getByPlaceholderText('01xxxxxxxxx')).toHaveValue('01012345678');
    expect(screen.getByPlaceholderText('12345678')).toHaveValue('12345678');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
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
    expect(screen.getByPlaceholderText('10')).toHaveValue('');
    expect(screen.getByPlaceholderText('50')).toHaveValue('');
    expect(screen.getByPlaceholderText('01xxxxxxxxx')).toHaveValue('');
    expect(screen.getByPlaceholderText('12345678')).toHaveValue('');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
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
    expect(screen.getByPlaceholderText('10')).toHaveValue('25');
    expect(screen.getByPlaceholderText('50')).toHaveValue('60');
    expect(screen.getByPlaceholderText('01xxxxxxxxx')).toHaveValue('01012345678');
    expect(screen.getByPlaceholderText('12345678')).toHaveValue('12345678');
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('refreshes paginated Admin lists after a successful garage approval', async () => {
    const onRefreshAdminLists = vi.fn().mockResolvedValue(undefined);
    render(
      <AdminDashboard
        allGarages={[{ id: 'pending-1', name: 'Pending Garage', status: 'pending' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
        packages={[]}
        onLogout={vi.fn()}
        currentAdminPin=""
        onRefreshAdminLists={onRefreshAdminLists}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve pending garage' }));

    await waitFor(() => expect(onRefreshAdminLists).toHaveBeenCalledOnce());
    expect(firestoreService.updateGarage).toHaveBeenCalledWith('pending-1', { status: 'approved' });
  });

  it('refreshes paginated Admin lists after a successful pending-garage rejection', async () => {
    deleteGarageWithRecoveryMock.mockResolvedValue({ ok: true });
    const onRefreshAdminLists = vi.fn().mockResolvedValue(undefined);
    render(
      <AdminDashboard
        allGarages={[{ id: 'pending-1', name: 'Pending Garage', status: 'pending' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
        packages={[]}
        onLogout={vi.fn()}
        currentAdminPin=""
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
    render(
      <AdminDashboard
        allGarages={[{ id: 'pending-1', name: 'Pending Garage' } as any]}
        isLoading={false}
        createNewGarage={vi.fn().mockResolvedValue(true)}
        setView={vi.fn()}
        setSelectedGarageForDetails={vi.fn()}
        setSelectedDelegateForDetails={vi.fn()}
        delegates={[]}
        packages={[]}
        onLogout={vi.fn()}
          currentAdminPin=""
        showToast={showToast}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reject pending garage' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm dialog action' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Too many delete requests; wait before retrying.', 'error'));
    expect(deleteGarageWithRecoveryMock).toHaveBeenCalledWith('pending-1');
    expect(firestoreService.deleteGarage).not.toHaveBeenCalled();
  });
});
