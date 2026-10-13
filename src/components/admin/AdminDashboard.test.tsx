import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AdminDashboard } from './AdminDashboard';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    getAdminGaragesPage: vi.fn(),
    approveRechargeRequest: vi.fn(),
    rejectRechargeRequest: vi.fn(),
    updateGarage: vi.fn(),
    deleteGarage: vi.fn(),
  },
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
  AdminNavigationAndViews: ({ setActiveTab, displayedGarages }: any) => (
    <>
      <button onClick={() => setActiveTab('garages')}>Open garages</button>
      {displayedGarages.map((garage: any) => <div key={garage.id}>{garage.name}</div>)}
    </>
  ),
}));
vi.mock('./AdminPlansModal', () => ({ AdminPlansModal: () => null }));
vi.mock('./AdminAddGarageModal', () => ({ AdminAddGarageModal: () => null }));
vi.mock('./PackageValidationErrorModal', () => ({ PackageValidationErrorModal: () => null }));
vi.mock('./AdminConfirmDialog', () => ({ AdminConfirmDialog: () => null }));
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
});

describe('AdminDashboard garage reads', () => {
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
});
