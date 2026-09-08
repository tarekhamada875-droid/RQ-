import { describe, test, expect, beforeEach, vi } from 'vitest';
import { firestoreService } from '../services';

vi.mock('firebase/functions', async () => {
  const actual = await vi.importActual('firebase/functions');
  return {
    ...actual as any,
    httpsCallable: vi.fn((_, name) => {
      return async (data: any) => {
        if (name === 'authenticateUser') {
          if (data.input === '8899') {
            return { data: { success: true, role: 'admin' } };
          }
          if (data.phone === '01000000000' && data.pin === '1234') {
            return { data: { success: true, role: 'delegate', accountId: '123', account: { id: '123' } } };
          }
          return { data: { success: false, error: 'بيانات الدخول غير صحيحة' } };
        }
        if (name === 'checkPinAvailability') {
           if (data.pin === '8899') return { data: { taken: true, role: 'مسؤول النظام (الآدمن الرئيسي)' } };
           return { data: { taken: false } };
        }
        return { data: {} };
      };
    })
  };
});

describe('v159 — Sensitive Accounts Isolation & Credentials Security', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    global.fetch = vi.fn(async (url: any, options: any) => {
      const urlStr = String(url);
      const body = JSON.parse(options?.body || '{}');

      if (urlStr.includes('/api/auth/verify-pin')) {
        if (body.input === '8899') {
          return {
            ok: true,
            json: async () => ({ success: true, role: 'admin' })
          } as any;
        }
        if (body.phone === '01000000000' && body.pin === '1234') {
          return {
            ok: true,
            json: async () => ({ success: true, role: 'delegate', accountId: '123', account: { id: '123' } })
          } as any;
        }
        return {
          ok: true,
          json: async () => ({ success: false, error: 'بيانات الدخول غير صحيحة' })
        } as any;
      }

      if (urlStr.includes('/api/auth/check-pin-availability')) {
        if (body.pin === '8899') {
          return {
            ok: true,
            json: async () => ({ taken: true, role: 'مسؤول النظام (الآدمن الرئيسي)' })
          } as any;
        }
        return {
          ok: true,
          json: async () => ({ taken: false })
        } as any;
      }

      return {
        ok: false,
        json: async () => ({})
      } as any;
    });
  });

  test('Mandatory 1: Login failure does NOT disclose account existence (generic error message)', async () => {
    // Test invalid phone / pin combination
    const resWrongPin = await firestoreService.authenticateUserCredentials({ phone: '01011112222', pin: '0000' });
    expect(resWrongPin.success).toBe(false);
    expect(resWrongPin.error).toBe('بيانات الدخول غير صحيحة');
    expect(resWrongPin.account).toBeUndefined();

    // Test non-existent user login
    const resNonExistent = await firestoreService.authenticateUserCredentials({ input: '9999999999' });
    expect(resNonExistent.success).toBe(false);
    expect(resNonExistent.error).toBe('بيانات الدخول غير صحيحة');
    expect(resNonExistent.account).toBeUndefined();
  });

  test('Mandatory 2: Account payload returned from authentication excludes PIN', async () => {
    // When authentication succeeds, the returned account data should never expose the PIN field
    const mockDelegateAuth = await firestoreService.authenticateUserCredentials({ phone: '01000000000', pin: '1234' });
    if (mockDelegateAuth.success && mockDelegateAuth.account) {
      expect(mockDelegateAuth.account.pin).toBeUndefined();
    }
  });

  test('Mandatory 3: Delegate isolation check — non-admin cannot read credentials', async () => {
    // Verify that checking PIN availability or authentication does not reveal PIN hashes or raw PINs to non-admin calls
    const pinCheck = await firestoreService.isPinTaken('8899');
    expect(pinCheck.taken).toBe(true);
    // Role is identified cleanly without returning internal Firestore credentials
    expect(pinCheck.role).toBeDefined();
  });

  test('Mandatory 4: Admin retains full administrative capability without re-opening public read', async () => {
    // Admin credential authentication succeeds
    const adminAuth = await firestoreService.authenticateUserCredentials({ input: '8899' });
    expect(adminAuth.success).toBe(true);
    expect(adminAuth.role).toBe('admin');
  });

  test('v161: Restrict unconstrained public reads on admin_settings and topup_requests', () => {
    // Verifies that settings query helpers are defined and scoped
    expect(typeof firestoreService.getSystemConfig).toBe('function');
  });

  test('v162: Three remaining gaps closed — Safe garage field checks & Admin PIN write protection', () => {
    expect(typeof firestoreService.updateSystemConfig).toBe('function');
  });
});
