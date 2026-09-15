import { auth, db } from '../firebase';
import { 
  doc, 
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { normalizeDigits } from '../utils';
import { claimEntitySession, releaseEntitySession, getCanonicalSessionId } from './authSessionService';
import { apiFetch } from '../api/apiClient';

export const authService = {
  checkPinAvailability: async (normalizedPinVal: string, excludeId?: string): Promise<{ taken: boolean; role?: string; name?: string }> => {
    try {
      const data = await apiFetch('/api/auth/check-pin-availability', {
        method: 'POST',
        body: { pin: normalizedPinVal, excludeId }
      });
      if (typeof data.taken === 'boolean') {
        return data;
      }
    } catch (e) {
      console.error('[AuthService] Error checking PIN availability:', e);
    }

    return { taken: false };
  },

  isPinTaken: async (pin: string, excludeId?: string): Promise<{ taken: boolean; role?: string; name?: string }> => {
    return authService.checkPinAvailability(pin, excludeId);
  },

  authenticateUserCredentials: async (credentials: {
    input?: string;
    phone?: string;
    pin?: string;
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
          token = await auth.currentUser.getIdToken();
        } catch (tErr) {
          console.warn('[AuthService] Could not obtain ID token:', tErr);
        }
      }

      const payload = {
        ...credentials,
        ...(token ? { firebaseIdToken: token } : {})
      };

      const data = await apiFetch('/api/auth/verify-pin', {
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
      const firebaseIdToken = typeof auth.currentUser?.getIdToken === 'function' ? await auth.currentUser.getIdToken().catch(() => '') : '';
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
      const firebaseIdToken = typeof auth.currentUser?.getIdToken === 'function' ? await auth.currentUser.getIdToken().catch(() => '') : '';
      const data = await apiFetch('/api/auth/validate-or-refresh-session', {
        method: 'POST',
        body: { uid, sessionId, role, entityId, firebaseIdToken }
      });
      return !!data?.valid;
    } catch (e) {
      console.error('[AuthService] Error validating session on server:', e);
    }
    return false;
  },

  releaseSessionOnServer: async (uid: string, sessionId: string, role: string, entityId: string): Promise<void> => {
    if (!uid || !sessionId || !role) return;
    try {
      const firebaseIdToken = typeof auth.currentUser?.getIdToken === 'function' ? await auth.currentUser.getIdToken().catch(() => '') : '';
      await apiFetch('/api/auth/release-session', {
        method: 'POST',
        body: { uid, sessionId, role, entityId, firebaseIdToken }
      });
    } catch (e) {
      console.error('[AuthService] Error releasing session on server:', e);
    }
  },

  releaseAdminSessionOnServer: async (uid: string, sessionId: string): Promise<void> => {
    if (!uid || !sessionId) return;
    try {
      const firebaseIdToken = typeof auth.currentUser?.getIdToken === 'function' ? await auth.currentUser.getIdToken().catch(() => '') : '';
      await apiFetch('/api/auth/release-admin-session', {
        method: 'POST',
        body: { uid, sessionId, firebaseIdToken }
      });
    } catch (e) {
      console.error('[AuthService] Error releasing admin session on server:', e);
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

  updateSession: async (collectionName: string, id: string, _meta?: any) => {
    if (!id) return;
    try {
      await setDoc(doc(db, collectionName, id), { lastActive: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error(`[AuthService] Error updating ${collectionName} session:`, e);
    }
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

  claimDelegateSession: async (delegateId: string, sessionId?: string, _deviceInfo?: any) => {
    if (!delegateId) throw new Error('DELEGATE_ID_REQUIRED');
    const sid = sessionId || getCanonicalSessionId();
    let targetUid = delegateId;
    try {
      if (auth && auth.currentUser && auth.currentUser.uid) {
        targetUid = auth.currentUser.uid;
      }
    } catch (e) {
      console.warn('[AuthService] Could not resolve current user for delegate claim:', e);
    }

    await claimEntitySession({
      role: 'delegate',
      entityId: delegateId,
      sessionId: sid,
      uid: targetUid
    });

    return { currentSessionId: sid };
  },

  claimOrRefreshDelegateSession: async (delegateId: string, sessionId?: string, deviceInfo?: any) => {
    return authService.claimDelegateSession(delegateId, sessionId, deviceInfo);
  },

  updateSupervisorSession: async (id: string, _meta?: any) => {
    if (!id) return;
    try {
      await setDoc(doc(db, 'supervisor_sessions', id), { lastActive: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error('[AuthService] Error updating supervisor session:', e);
    }
  },

  updateStaffSession: async (id: string, _meta?: any) => {
    if (!id) return;
    try {
      await setDoc(doc(db, 'staff_sessions', id), { lastActive: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error('[AuthService] Error updating staff session:', e);
    }
  }
};
