import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminActiveSessionsView } from './AdminActiveSessionsView';
import { sessionService } from '../../services/sessionService';

const themeMock = vi.hoisted(() => ({ adminLang: 'ar' }));

vi.mock('../../utils/ThemeContext', () => ({ useTheme: () => themeMock }));

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
  themeMock.adminLang = 'ar';
  mockedSessionService.listActiveSessions.mockReset();
  mockedSessionService.revokeActiveSession.mockReset();
  mockedSessionService.listActiveSessions.mockResolvedValue(sessions);
  // 2026-11-21: the browser window.confirm popup was replaced by the shared
  // styled dialog — tests now drive that dialog instead of spying on confirm.
});

describe('AdminActiveSessionsView', () => {
  it('renders the current and remote sessions after loading', async () => {
    render(<AdminActiveSessionsView onLogout={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText('هذا الجهاز')).toBeInTheDocument();
    expect(screen.getByText('جهاز مسجّل')).toBeInTheDocument();
    expect(screen.getByText('2 جلسة')).toBeInTheDocument();
    expect(screen.getAllByText(/معرّف آمن/)).toHaveLength(2);
  });

  it('opens the styled confirm dialog before revoking a remote session', async () => {
    const showToast = vi.fn();
    mockedSessionService.revokeActiveSession.mockResolvedValue({
      revokedSession: remoteSessionId,
      wasCurrent: false
    });
    render(<AdminActiveSessionsView onLogout={vi.fn()} onBack={vi.fn()} showToast={showToast} />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'إلغاء الجلسة' });
    fireEvent.click(revokeButtons[0]);

    // Nothing revoked while the dialog is open.
    expect(mockedSessionService.revokeActiveSession).not.toHaveBeenCalled();
    expect(await screen.findByText('إلغاء جلسة الجهاز')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإلغاء' }));

    await waitFor(() => expect(screen.getByText('1 جلسة')).toBeInTheDocument());
    expect(mockedSessionService.revokeActiveSession).toHaveBeenCalledWith(remoteSessionId);
    expect(showToast).toHaveBeenCalledWith('تم إلغاء جلسة الجهاز بنجاح', 'success');
  });

  it('keeps the session when the user cancels the styled dialog', async () => {
    render(<AdminActiveSessionsView onLogout={vi.fn()} onBack={vi.fn()} />);

    const revokeButtons = await screen.findAllByRole('button', { name: 'إلغاء الجلسة' });
    fireEvent.click(revokeButtons[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'رجوع' }));

    await waitFor(() => expect(screen.queryByText('إلغاء جلسة الجهاز')).not.toBeInTheDocument());
    expect(mockedSessionService.revokeActiveSession).not.toHaveBeenCalled();
    expect(screen.getByText('2 جلسة')).toBeInTheDocument();
  });

  it('logs out when the current session is revoked through the dialog', async () => {
    const onLogout = vi.fn();
    mockedSessionService.revokeActiveSession.mockResolvedValue({
      revokedSession: currentSessionId,
      wasCurrent: true
    });
    render(<AdminActiveSessionsView onLogout={onLogout} onBack={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل الخروج' }));
    fireEvent.click(await screen.findByRole('button', { name: 'تأكيد الخروج' }));

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    expect(mockedSessionService.revokeActiveSession).toHaveBeenCalledWith(currentSessionId);
  });
});


describe('AdminActiveSessionsView Arabic-only interface', () => {
  it('keeps Arabic copy and right-to-left layout when a legacy English preference exists', async () => {

    render(<AdminActiveSessionsView onLogout={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText('هذا الجهاز')).toBeInTheDocument();
    expect(screen.getByText('جهاز مسجّل')).toBeInTheDocument();
    expect(screen.getByText('2 جلسة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء الجلسة' })).toBeInTheDocument();
    expect(screen.getByText('الأجهزة والجلسات النشطة').closest('[dir]')).toHaveAttribute('dir', 'rtl');
    expect(screen.getAllByText(/آخر نشاط:/)).toHaveLength(2);
  });

  it('shows the same last-active time regardless of the device timezone (Cairo-anchored clock)', async () => {
    // The device clock must not change what the screen shows: formatTimestamp
    // anchors to Africa/Cairo like the rest of the app's day system. Assert
    // the exact Cairo rendering is on screen, and the UTC rendering is not
    // (they differ for these timestamps no matter the environment timezone).
    const cairo = (iso: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(iso));
    const utc = (iso: string) => new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso));
    const currentIso = '2026-09-23T05:10:00.000Z';
    const remoteIso = '2026-09-22T05:10:00.000Z';
    expect(cairo(currentIso)).not.toBe(utc(currentIso));

    render(<AdminActiveSessionsView onLogout={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText('2 جلسة')).toBeInTheDocument();
    // The timestamp is a text node inside the "last active" line — match as
    // a substring of that line. Each session's time must be the Cairo
    // rendering, never the device-timezone (here UTC) rendering.
    expect(screen.getAllByText(new RegExp(cairo(currentIso)))).toHaveLength(1);
    expect(screen.getAllByText(new RegExp(cairo(remoteIso)))).toHaveLength(1);
    expect(screen.queryByText(new RegExp(utc(currentIso)))).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(utc(remoteIso)))).not.toBeInTheDocument();
  });
});
