import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminAnnouncementsView } from './AdminAnnouncementsView';
import { firestoreService } from '../../services';

vi.mock('../../services', () => ({
  firestoreService: {
    onAnnouncementsChange: vi.fn(),
    createAnnouncement: vi.fn(),
    deleteAnnouncement: vi.fn(),
    toggleAnnouncementActive: vi.fn(),
  },
}));

vi.mock('../../utils/ThemeContext', () => ({
  useTheme: () => ({ adminLang: 'en' }),
}));

vi.mock('../../utils/adminTranslations', () => ({
  useAdminTranslation: () => (key: string) => key,
}));

const announcement = {
  id: 'announcement-1',
  title: 'Test notice',
  content: 'Test notice body',
  target: 'all' as const,
  targetGarageId: null,
  targetGarageName: null,
  priority: 'normal' as const,
  isActive: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(firestoreService.onAnnouncementsChange).mockImplementation((callback: any) => {
    callback([announcement]);
    return vi.fn();
  });
  vi.mocked(firestoreService.deleteAnnouncement).mockResolvedValue(undefined);
});

describe('AdminAnnouncementsView delete action', () => {
  it('does not delete until confirmed, then shows success feedback', async () => {
    render(<AdminAnnouncementsView allGarages={[]} />);

    fireEvent.click(screen.getByTitle('حذف'));
    expect(screen.getByText('هل أنت متأكد من حذف هذا الإعلان؟')).toBeInTheDocument();
    expect(firestoreService.deleteAnnouncement).not.toHaveBeenCalled();

    const confirmButtons = screen.getAllByRole('button', { name: 'حذف' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(firestoreService.deleteAnnouncement).toHaveBeenCalledWith('announcement-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('تم حذف الإعلان بنجاح');
  });

  it('leaves the announcement untouched when deletion is cancelled', () => {
    render(<AdminAnnouncementsView allGarages={[]} />);

    fireEvent.click(screen.getByTitle('حذف'));
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));

    expect(firestoreService.deleteAnnouncement).not.toHaveBeenCalled();
    expect(screen.queryByText('هل أنت متأكد من حذف هذا الإعلان؟')).not.toBeInTheDocument();
  });

  it('shows an error if the confirmed delete fails', async () => {
    vi.mocked(firestoreService.deleteAnnouncement).mockRejectedValueOnce(new Error('request failed'));
    render(<AdminAnnouncementsView allGarages={[]} />);

    fireEvent.click(screen.getByTitle('حذف'));
    const confirmButtons = screen.getAllByRole('button', { name: 'حذف' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    expect(await screen.findByRole('status')).toHaveTextContent('فشل حذف الإعلان');
  });
});
