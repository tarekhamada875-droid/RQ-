import { doc, runTransaction, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { EntityRole } from '../types';
import { authService } from './authService';
import {
  ENTITY_COLLECTIONS,
  SECURITY_COLLECTIONS,
  getEntityDocumentId
} from '../domain/auth/sessionPolicy';
import {
  SESSION_TIMEOUT_MS,
  claimSessionInTransaction
} from '../domain/auth/sessionTransactions';
export type { EntityRole };

export interface GarageSessionDoc {
  garageId?: string;
  activeSessionId?: string;
  sessionId?: string;
  deviceId?: string;
  lastHeartbeat?: string;
}

export interface ClaimSessionParams {
  role: EntityRole;
  entityId: string;
  sessionId: string;
  uid: string;
  pin?: string;
}

export { SESSION_TIMEOUT_MS } from '../domain/auth/sessionTransactions';
export const HEARTBEAT_TIMEOUT_MS = SESSION_TIMEOUT_MS;

export const getCanonicalSessionId = (): string => {
  if (typeof window === 'undefined') return 'server_session';
  try {
    let sid = localStorage.getItem('rq_canonical_session_id');
    if (!sid) {
      // Also check rq_garage_device_id for backward compatibility
      sid = localStorage.getItem('rq_garage_device_id');
      if (!sid) {
        sid = typeof crypto !== 'undefined' && crypto.randomUUID 
          ? crypto.randomUUID() 
          : 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      localStorage.setItem('rq_canonical_session_id', sid);
    }
    return sid;
  } catch (e) {
    return 'fallback_session_' + Date.now();
  }
};

export const getOrCreateDeviceId = (): string => {
  return getCanonicalSessionId();
};

// In-memory cache to prevent duplicate Firestore transaction collisions within the same client session
const recentClaims = new Map<string, number>();

export const _resetRecentClaimsForTesting = () => {
  recentClaims.clear();
};

export const claimEntitySession = async ({ role, entityId, sessionId, uid, pin }: ClaimSessionParams): Promise<void> => {
  if (!role || !entityId || !sessionId || !uid) {
    throw new Error('INVALID_SESSION_PARAMS');
  }

  const claimKey = `${role}_${entityId}_${sessionId}_${uid}`;
  const now = Date.now();
  const lastClaimTime = recentClaims.get(claimKey);
  if (lastClaimTime && (now - lastClaimTime < 10000)) {
    return;
  }

  // 1. Authoritative Server Validation / Heartbeat Refresh (works for all roles, bypassing client-side creation locks)
  try {
    const isValidOnServer = await authService.validateOrRefreshSessionOnServer(uid, sessionId, role, entityId);
    if (isValidOnServer) {
      recentClaims.set(claimKey, Date.now());
      return;
    }
  } catch (err) {
    console.warn('Server session validation fallback:', err);
  }

  // For Admin role: Use authoritative Server API with PIN or existing token
  if (role === 'admin') {
    try {
      const serverClaim = await authService.claimAdminSessionOnServer(uid, sessionId, pin);
      if (serverClaim.success) {
        recentClaims.set(claimKey, Date.now());
        return;
      }
      if (serverClaim.error === 'SESSION_OCCUPIED') {
        throw new Error('SESSION_OCCUPIED');
      }
    } catch (err: any) {
      if (err?.message === 'SESSION_OCCUPIED') {
        throw err;
      }
      console.warn('Server admin session claim fallback to client transaction:', err);
    }
  }

  const entityColl = ENTITY_COLLECTIONS[role];
  const secColl = SECURITY_COLLECTIONS[role];
  const entityDocId = getEntityDocumentId(role, entityId);

  const entityRef = doc(db, entityColl, entityDocId);
  const securitySessionRef = doc(db, secColl, uid);

  await runTransaction(db, async (transaction) => {
    await claimSessionInTransaction(transaction, { entityRef, securitySessionRef, role, sessionId });
  });

  recentClaims.set(claimKey, Date.now());
};

export const releaseEntitySession = async ({ role, entityId, sessionId, uid }: ClaimSessionParams): Promise<void> => {
  if (!role || !entityId || !sessionId || !uid) return;

  const claimKey = `${role}_${entityId}_${sessionId}_${uid}`;
  recentClaims.delete(claimKey);

  // The server owns the security documents. Await its owner/session-checked
  // release before Firebase sign-out; never delete session docs from the client.
  await authService.releaseSessionOnServer(uid, sessionId, role, entityId);
};

export const refreshEntitySession = async ({ role, entityId, sessionId, uid }: ClaimSessionParams): Promise<void> => {
  if (!role || !entityId || !sessionId || !uid) return;

  const entityColl = ENTITY_COLLECTIONS[role];
  const secColl = SECURITY_COLLECTIONS[role];
  const entityDocId = getEntityDocumentId(role, entityId);

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, entityColl, entityDocId), {
      lastActive: serverTimestamp()
    });
    batch.set(doc(db, secColl, uid), {
      lastActive: serverTimestamp()
    }, { merge: true });
    await batch.commit();
  } catch (err) {
    console.warn('refreshEntitySession failed:', err);
  }
};

export const updateSessionHeartbeat = async (garageId: string): Promise<void> => {
  const sid = getCanonicalSessionId();
  await refreshEntitySession({
    role: 'garage',
    entityId: garageId,
    sessionId: sid,
    uid: garageId
  });
};
