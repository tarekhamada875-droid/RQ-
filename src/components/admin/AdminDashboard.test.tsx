import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminDashboard } from './AdminDashboard';
import { firestoreService } from '../../services';

const { deleteGarageWithRecoveryMock, garageDeletionFailureMessageMock } = vi.hoisted(() => ({
  deleteGarageWithRecoveryMock: vi.fn(),
  garageDeletionFailureMessageMock: vi.fn()
}));

vi.mock('../../services', () => ({
  firestoreService: {
    getAdminGaragesPage: vi.fn(),
    approveRechargeRequest: vi.fn(),
    rejectRechargeRequest: vi.fn(),
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
  AdminNavigationAndViews: ({ setActiveTab, displayedGarages, handleRejectGarage }: any) => (
    <>
      <button onClick={() => setActiveTab('garages')}>Open garages</button>
      <button onClick={() => void handleRejectGarage({ id: 'pending-1', name: 'Pending Garage' }).catch(() => {})}>
        Reject pending garage
      </button>
      {displayedGarages.map((garage: any) => <div key={garage.id}>{garage.name}</div>)}
    </>
  ),
}));
vi.mock('./AdminPlansModal', () => ({ AdminPlansModal: () => null }));
vi.mock('./AdminAddGarageModal', () => ({ AdminAddGarageModal: () => null }));
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
        rechargeRequests={[]}
        currentAdminPin=""
        currentWalletNumber=""
        onUpdateWalletNumber={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open garages' }));

    expect(await screen.findByText('Already loaded garage')).toBeInTheDocument();
    expect(firestoreService.getAdminGaragesPage).not.toHaveBeenCalled();
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
        rechargeRequests={[]}
        currentAdminPin=""
        currentWalletNumber=""
        onUpdateWalletNumber={vi.fn().mockResolvedValue(undefined)}
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
