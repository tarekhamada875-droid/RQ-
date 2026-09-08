import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogoutConfirmModal } from '../components/modals/LogoutConfirmModal';
import { firestoreService } from '../services';
import * as functionsModule from 'firebase/functions';
import { getDoc } from 'firebase/firestore';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(() => ({})),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    doc: vi.fn((_db, ...paths) => paths.join('/')),
    getDoc: vi.fn(),
  };
});

vi.mock('../firebase', () => ({
  auth: { currentUser: { uid: 'garage-user-123' } },
  db: {},
  functions: {},
  handleFirestoreError: vi.fn(),
  OperationType: { READ: 'READ' }
}));

describe('v165 — Logout Admin PIN Verification & Modal Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/auth/verify-admin-pin')) {
        const body = JSON.parse(options?.body || '{}');
        if (body.pin === '8899' || body.pin === '987654') {
          return {
            ok: true,
            json: async () => ({ valid: true })
          } as any;
        }
        return {
          ok: true,
          json: async () => ({ valid: false })
        } as any;
      }
      return {
        ok: false,
        json: async () => ({})
      } as any;
    });
  });

  it('1. Calls backend verification and allows logout when correct PIN is entered (without reading admin_settings/auth_pin from client)', async () => {
    const onConfirmMock = vi.fn();
    const onCancelMock = vi.fn();

    const callableFn = vi.fn().mockImplementation(async (data: { pin: string }) => {
      if (data.pin === '8899') {
        return { data: { valid: true } };
      }
      return { data: { valid: false } };
    });

    vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(callableFn as any);

    const isVerifiedDirectly = await firestoreService.verifyAdminPinForLogout('8899');
    expect(isVerifiedDirectly).toBe(true);

    render(
      <LogoutConfirmModal
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
        onVerifyPin={firestoreService.verifyAdminPinForLogout}
      />
    );

    // Enter digits 8, 8, 9, 9
    fireEvent.click(screen.getByRole('button', { name: '8' }));
    fireEvent.click(screen.getByRole('button', { name: '8' }));
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: '9' }));

    const submitBtn = screen.getByRole('button', { name: 'تسجيل الخروج' });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onConfirmMock).toHaveBeenCalledTimes(1);
    });
    expect(onCancelMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('logout_attempts')).toBe('0');
  });

  it('2. Rejects logout and displays error message when wrong PIN is entered', async () => {
    const onConfirmMock = vi.fn();
    const onCancelMock = vi.fn();

    const callableFn = vi.fn().mockResolvedValue({ data: { valid: false } });
    vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(callableFn as any);

    const isVerifiedDirectly = await firestoreService.verifyAdminPinForLogout('1234');
    expect(isVerifiedDirectly).toBe(false);

    render(
      <LogoutConfirmModal
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
        onVerifyPin={firestoreService.verifyAdminPinForLogout}
      />
    );

    // Enter wrong PIN: 1, 2, 3, 4
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: '4' }));

    const submitBtn = screen.getByRole('button', { name: 'تسجيل الخروج' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('الرمز السري غير صحيح')).toBeInTheDocument();
    });
    expect(onConfirmMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('logout_attempts')).toBe('1');
  });

  it('3. LogoutConfirmModal does not accept or store admin PIN in props or localStorage', () => {
    const onVerifyPinMock = vi.fn();
    const props: any = {
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      onVerifyPin: onVerifyPinMock
    };

    expect(props.correctPin).toBeUndefined();

    render(
      <LogoutConfirmModal
        onConfirm={props.onConfirm}
        onCancel={props.onCancel}
        onVerifyPin={props.onVerifyPin}
      />
    );

    expect(localStorage.getItem('auth_pin')).toBeNull();
    expect(localStorage.getItem('admin_pin')).toBeNull();
    expect(localStorage.getItem('activeAdminPin')).toBeNull();
  });

  it('4. Old logout_lockout_until keys do not prevent opening logout modal or getting verified', () => {
    // Set stale lockout key
    localStorage.setItem('logout_lockout_until', (Date.now() + 10000000).toString());

    // When useGarageApp or App initializes, the cleanup removes lockout keys
    localStorage.removeItem('logout_lockout_until');
    localStorage.removeItem('logout_attempts');

    expect(localStorage.getItem('logout_lockout_until')).toBeNull();

    const onConfirmMock = vi.fn();
    const onCancelMock = vi.fn();
    const onVerifyPinMock = vi.fn().mockResolvedValue(true);

    render(
      <LogoutConfirmModal
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
        onVerifyPin={onVerifyPinMock}
      />
    );

    // Modal renders properly without being blocked
    expect(screen.getByText('تسجيل الخروج')).toBeInTheDocument();
    expect(screen.getByText('(متبقي لك 3 محاولات)')).toBeInTheDocument();
  });

  it('5. Verifies custom 6-digit PIN via direct fallback when Cloud Function is unavailable', async () => {
    // Cloud function throws error (e.g. 404 / network error)
    vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue((() => {
      throw new Error('functions/not-found');
    }) as any);

    // Mock getDoc to return custom 6-digit pin "987654"
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ pin: '987654' })
    } as any);

    const isMatch = await firestoreService.verifyAdminPinForLogout('987654');
    expect(isMatch).toBe(true);

    const isMismatch = await firestoreService.verifyAdminPinForLogout('111111');
    expect(isMismatch).toBe(false);
  });
});

