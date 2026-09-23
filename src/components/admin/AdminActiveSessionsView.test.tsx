import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminActiveSessionsView } from './AdminActiveSessionsView';
import { sessionService } from '../../services/sessionService';

vi.mock('../../services/sessionService', () => ({
  sessionService: {
    listActiveSessions: vi.fn(),
    revokeActiveSession: vi.fn()
  }
}));

const mockedSessionService = vi.mocked(sessionService);
const currentSessionId = 'a'.repeat(64);
const remoteSessionId = 'b'.repeat(64);

const sessions = [
  {
    id: currentSessionId,
    isCurrent: true,
    isActive: true,
    createdAt: '2026-09-23T05:00:00.000Z',
    lastActive: '2026-09-23T05:10:00.000Z'
  },
  {
    id: remoteSessionId,
    isCurrent: false,
    isActive: true,
    createdAt: '2026-09-22T05:00:00.000Z',
    lastActive: '2026-09-22T05:10:00.000Z'
  }
];

beforeEach(() => {
  mockedSessionService.listActiveSessions.mockReset();
  mockedSessionService.revokeActiveSession.mockReset();
  mockedSessionService.listActiveSessions.mockResolvedValue(sessions);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminActiveSessionsView', () => {
  it('renders the current and remote sessions after loading', async () => {
    render(<AdminActiveSessionsView onLogout={vi.fn()} onBack={vi.fn()} t={(key) => key} />);

    expect(await screen.findByText('هذا الجهاز')).toBeInTheDocument();
    expect(screen.getByText('جهاز مسجّل')).toBeInTheDocument();
    expect(screen.getByText('2 جلسة')).toBeInTheDocument();
    expect(screen.getAllByText(/معرّف آمن/)).toHaveLength(2);
  });

  it('removes a revoked remote session and reports success', async () => {
    const showToast = vi.fn();
    mockedSessionService.revokeActiveSession.mockResolvedValue({
      success: true,
      revokedSession: remoteSessionId,
      wasCurrent: false
    });
    render(<AdminActiveSessionsView onLogout={vi.fn()} onBack={vi.fn()} t={(key) => key} showToast={showToast} />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'إلغاء الجلسة' });
    fireEvent.click(revokeButtons[0]);

    await waitFor(() => expect(screen.getByText('1 جلسة')).toBeInTheDocument());
    expect(mockedSessionService.revokeActiveSession).toHaveBeenCalledWith(remoteSessionId);
    expect(showToast).toHaveBeenCalledWith('تم إلغاء جلسة الجهاز بنجاح', 'success');
  });

  it('logs out when the current session is revoked', async () => {
    const onLogout = vi.fn();
    mockedSessionService.revokeActiveSession.mockResolvedValue({
      success: true,
      revokedSession: currentSessionId,
      wasCurrent: true
    });
    render(<AdminActiveSessionsView onLogout={onLogout} onBack={vi.fn()} t={(key) => key} />);

    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل الخروج' }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(mockedSessionService.revokeActiveSession).toHaveBeenCalledWith(currentSessionId);
  });
});
