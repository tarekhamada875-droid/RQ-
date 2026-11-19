import { auth } from '../firebase';
import { normalizeDigits } from '../utils/plates';
import { releaseEntitySession, getCanonicalSessionId } from './authSessionService';
import { apiFetch } from '../api/apiClient';
import { debugRecorder } from '../debug/debugRecorder';

/**
 * AUDIT EXTENSION (2026-11-19, owner login-hang investigation):
 * Wrap auth.currentUser.getIdToken() with debug-recorder visibility. The
 * previous call sites used `await auth.currentUser.getIdToken().catch(() => '')`
 * — silent, no timing, no event when it hung. A hung token refresh was the
 * prime suspect in the owner's login-hang incident (rq-debug-2026-11-19
 * file showed 0 API calls past boot, no JS errors, no listener registration
 * past system_config_worker_api — pointing at this exact call as the stall).
 *
 * Behavior is identical: on error or no-current-user, returns ''. PR 1 is
 * observation-only; PR 2 will add a Promise.race timeout so a hung call
 * rejects and lets the coordinator's existing error path bail to login.
 *
 * The `label` argument flows into the debug event so a single debug file
 * shows which of the 4 call sites a hung token refresh originated from.
 */
async function getAuthIdTokenForDebug(label: string): Promise<string> {
  const hasUser = typeof auth.currentUser?.getIdToken === 'function';
  if (!hasUser) {
    debugRecorder.authEvent('get_id_token_skipped', { label, reason: 'no_current_user' });
    return '';
  }
  const startMs = Date.now();
  try {
    const token = await auth.currentUser!.getIdToken();
    debugRecorder.authEvent('get_id_token_success', { label, ms: Date.now() - startMs });
    return token;
  } catch (err: any) {
    debugRecorder.authEvent('get_id_token_error', {
      label,
      ms: Date.now() - startMs,
      code: err?.code || null,
      msg: String(err?.message || '').slice(0, 200),
    });
    return '';
  }
}

export const authService = {
  checkPinAvailability: async (normalizedPinVal: string, excludeId?: string): Promise<{ taken: boolean; role?: string; roleKey?: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage' | 'retired'; name?: string }> => {
    const data = await apiFetch<{ taken: boolean; role?: string; name?: string }>('/api/auth/check-pin-availability', {
      method: 'POST',
      body: { pin: normalizedPinVal, excludeId }
    });
    if (typeof data.taken !== 'boolean') throw new Error('PIN_AVAILABILITY_CHECK_FAILED');
    return data;
  },

  isPinTaken: async (pin: string, excludeId?: string): Promise<{ taken: boolean; role?: string; roleKey?: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage' | 'retired'; name?: string }> => {
    return authService.checkPinAvailability(pin, excludeId);
  },

  authenticateUserCredentials: async (credentials: {
    input?: string;
    pin?: string;
    expectedRole?: 'delegate';
    uid?: string;
    sessionId?: string;
    firebaseIdToken?: string;
  }): Promise<{
    success: boolean;
    role?: 'admin' | 'supervisor' | 'delegate' | 'staff' | 'garage';
    accountId?: string;
    account?: any;
    sessionClaimed?: boolean;
    error?: string;
  }> => {
    try {
      let token = credentials.firebaseIdToken;
      if (!token && auth && auth.currentUser) {
        try {
          token = await getAuthIdTokenForDebug('authenticateUserCredentials');
        } catch (tErr) {
          console.warn('[AuthService] Could not obtain ID token:', tErr);
        }
      }

      const payload = {
        ...credentials,
        ...(token ? { firebaseIdToken: token } : {})
      };

      const data = await apiFetch<{ success: boolean; role?: 'admin' | 'delegate' | 'staff' | 'garage'; accountId?: string; account?: any; sessionClaimed?: boolean; error?: string }>('/api/auth/verify-pin', {
        method: 'POST',
        body: payload
      });
      if (typeof data.success === 'boolean') {
        return data;
      }
    } catch (e: any) {
      console.error('[AuthService] Error verifying PIN:', e);
      return { success: false, error: e.message || 'فشل التحقق من الخادم' };
    }

    return { success: false, error: 'تعذر الاتصال بخادم التحقق' };
  },

  claimAdminSessionOnServer: async (uid: string, sessionId: string, pin?: string): Promise<{ success: boolean; error?: string }> => {
    if (!uid || !sessionId) return { success: false, error: 'INVALID_PARAMS' };
    try {
      const firebaseIdToken = await getAuthIdTokenForDebug('claimAdminSessionOnServer');
      const data = await apiFetch('/api/auth/claim-admin-session', {
        method: 'POST',
        body: { uid, sessionId, pin, firebaseIdToken }
      });
      return { success: !!data?.success, error: data?.error };
    } catch (e: any) {
      console.error('[AuthService] Error claiming admin session on server:', e);
      return { success: false, error: e.message };
    }
  },

  validateOrRefreshSessionOnServer: async (uid: string, sessionId: string, role: string, entityId: string): Promise<boolean> => {
    if (!uid || !sessionId || !role) return false;
    try {
      const firebaseIdToken = await getAuthIdTokenForDebug('validateOrRefreshSessionOnServer');
      const data = await apiFetch<{ valid?: boolean }>('/api/auth/validate-or-refresh-session', {
        method: 'POST',
        body: { uid, sessionId, role, entityId, firebaseIdToken }
      });
      return !!data?.valid;
    } catch (e: any) {
      if (e?.code === 'RATE_LIMIT_EXCEEDED' || e?.status === 429) {
        console.warn('[AuthService] Session validation throttled by rate limiter:', e?.message || e);
      } else {
        console.warn('[AuthService] Error validating session on server:', e?.message || e);
      }
      throw e;
    }
  },

  releaseSessionOnServer: async (uid: string, sessionId: string, role: string, entityId: string): Promise<void> => {
    if (!uid || !sessionId || !role) return;
    try {
      const firebaseIdToken = await getAuthIdTokenForDebug('releaseSessionOnServer');
      await apiFetch('/api/auth/release-session', {
        method: 'POST',
        body: { uid, sessionId, role, entityId, firebaseIdToken }
      });
    } catch (e) {
      console.error('[AuthService] Error releasing session on server:', e);
      throw e;
    }
  },


  verifyAdminPinForLogout: async (inputPin: string): Promise<boolean> => {
    const normInput = normalizeDigits(String(inputPin || '')).replace(/\D/g, '');
    try {
      const data = await apiFetch('/api/auth/verify-admin-pin', {
        method: 'POST',
        body: { pin: normInput }
      });
      if (typeof data.valid === 'boolean') {
        return data.valid;
      }
    } catch (e) {
      console.error('[AuthService] Error verifying admin PIN for logout:', e);
    }

    return false;
  },


  releaseDelegateSession: async (delegateId: string, sessionId?: string) => {
    if (!delegateId) return;
    try {
      const sid = sessionId || getCanonicalSessionId();
      let targetUid = delegateId;
      try {
        if (auth && auth.currentUser && auth.currentUser.uid) {
          targetUid = auth.currentUser.uid;
        }
      } catch (e) {
        console.warn('[AuthService] Could not resolve current user for delegate release:', e);
      }
      await releaseEntitySession({
        role: 'delegate',
        entityId: delegateId,
        sessionId: sid,
        uid: targetUid
      });
    } catch (e) {
      console.error('[AuthService] Error releasing delegate session:', e);
    }
  },
};
