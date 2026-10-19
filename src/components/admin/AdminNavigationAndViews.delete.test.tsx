import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminNavigationAndViews } from './AdminNavigationAndViews';

const { deleteGarageWithRecoveryMock, garageDeletionFailureMessageMock } = vi.hoisted(() => ({
  deleteGarageWithRecoveryMock: vi.fn(),
  garageDeletionFailureMessageMock: vi.fn()
}));

vi.mock('../../services/garageDeletionService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/garageDeletionService')>();
  return {
    ...actual,
    deleteGarageWithRecovery: deleteGarageWithRecoveryMock,
    garageDeletionFailureMessage: garageDeletionFailureMessageMock
  };
});
vi.mock('./AdminTrialLeadsView', () => ({
  AdminTrialLeadsView: ({ onDeleteGarage }: any) => (
    <button onClick={() => onDeleteGarage('garage-1', 'Trial Garage')}>Delete trial garage</button>
  )
}));

const makeProps = (setConfirmDialog: any, showToast: any) => ({
  activeTab: 'trial_leads',
  setActiveTab: vi.fn(),
  currentSupervisor: null,
  delegates: [],
  pendingGarages: [],
  packages: [],
  approvedGarages: [],
  allGarages: [{ id: 'garage-1', name: 'Trial Garage' } as any],
  displayedGarages: [],
  adminSearch: '',
  setAdminSearch: vi.fn(),
  onSelectGarage: vi.fn(),
  onSelectDelegate: vi.fn(),
  handleApproveGarage: vi.fn().mockResolvedValue(undefined),
  handleRejectGarage: vi.fn().mockResolvedValue(undefined),
  setConfirmDialog,
  setPackageValidationError: vi.fn(),
  currentWalletNumber: '',
  onUpdateWalletNumber: vi.fn().mockResolvedValue(undefined),
  currentAdminPin: '',
  adminLang: 'en' as const,
  t: (key: string) => key,
  showToast,
  onLogout: vi.fn()
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Admin trial-lead garage deletion', () => {
  it('waits for confirmation and displays the shared failure reason without claiming success', async () => {
    deleteGarageWithRecoveryMock.mockResolvedValue({
      ok: false,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      status: null,
      error: new Error('RATE_LIMIT_EXCEEDED')
    });
    garageDeletionFailureMessageMock.mockReturnValue('Too many delete attempts. Wait 30 seconds.');
    const setConfirmDialog = vi.fn();
    const showToast = vi.fn();
    render(<AdminNavigationAndViews {...makeProps(setConfirmDialog, showToast)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete trial garage' }));
    expect(deleteGarageWithRecoveryMock).not.toHaveBeenCalled();
    const confirmation = setConfirmDialog.mock.calls[0][0];
    expect(confirmation.message).toContain('كافة بياناته نهائياً');

    await confirmation.onConfirm();

    expect(deleteGarageWithRecoveryMock).toHaveBeenCalledWith('garage-1');
    expect(garageDeletionFailureMessageMock).toHaveBeenCalledWith(expect.objectContaining({ ok: false }), 'en');
    expect(setConfirmDialog.mock.calls[1][0]).toMatchObject({
      title: 'Garage deletion failed',
      message: 'Too many delete attempts. Wait 30 seconds.',
      confirmText: 'OK'
    });
    expect(showToast).not.toHaveBeenCalledWith('Garage deleted successfully.', 'success');
  });
});
