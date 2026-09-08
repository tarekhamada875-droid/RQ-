import { doc, runTransaction, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { safeDate } from '../utils';
import { EntityRole } from '../types';
import { authService } from './authService';
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

export const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes timeout takeover window
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

const entityCollectionMap: Record<EntityRole, string> = {
  admin: 'admin_settings',
  supervisor: 'supervisors',
  delegate: 'delegates',
  staff: 'staff',
  garage: 'garages',
};

const securityCollectionMap: Record<EntityRole, string> = {
  admin: 'admin_sessions',
  supervisor: 'supervisor_sessions',
  delegate: 'delegate_sessions',
  staff: 'staff_sessions',
  garage: 'garage_sessions',
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

  const entityColl = entityCollectionMap[role];
  const secColl = securityCollectionMap[role];
  const entityDocId = role === 'admin' ? 'auth_pin' : entityId;

  const entityRef = doc(db, entityColl, entityDocId);
  const securitySessionRef = doc(db, secColl, uid);

  await runTransaction(db, async (transaction) => {
    const entitySnap = await transaction.get(entityRef);
    const secSnap = await transaction.get(securitySessionRef);

    if (entitySnap.exists()) {
      const data = entitySnap.data();
      const activeSessionId = data?.currentSessionId;
      const lastActive = safeDate(data?.lastActive).getTime();
      const isAlive = lastActive > 0 && (Date.now() - lastActive < SESSION_TIMEOUT_MS);

      if (activeSessionId && activeSessionId !== sessionId && isAlive) {
        if (role === 'delegate') {
          throw new Error('DELEGATE_SESSION_OCCUPIED');
        }
        if (role === 'garage') {
          throw new Error('ACCESS_DENIED_ACTIVE_SESSION_EXISTS');
        }
        throw new Error('SESSION_OCCUPIED');
      }
    }

    // Update entity lock
    if (entitySnap.exists()) {
      transaction.update(entityRef, {
        currentSessionId: sessionId,
        lastActive: serverTimestamp()
      });
    } else if (transaction.set) {
      transaction.set(entityRef, {
        currentSessionId: sessionId,
        lastActive: serverTimestamp()
      }, { merge: true });
    }

    // Update security session doc if it exists (creation is reserved for Server Admin SDK)
    const isSecDoc = secSnap && typeof secSnap.exists === 'function' && secSnap.exists();
    if (isSecDoc) {
      transaction.update(securitySessionRef, {
        isActive: true,
        lastActive: serverTimestamp()
      });
    }
  });

  recentClaims.set(claimKey, Date.now());
};

export const releaseEntitySession = async ({ role, entityId, sessionId, uid }: ClaimSessionParams): Promise<void> => {
  if (!role || !entityId || !sessionId || !uid) return;

  const claimKey = `${role}_${entityId}_${sessionId}_${uid}`;
  recentClaims.delete(claimKey);

  // Authoritative server release
  authService.releaseSessionOnServer(uid, sessionId, role, entityId).catch(() => {});
  if (role === 'admin') {
    authService.releaseAdminSessionOnServer(uid, sessionId).catch(() => {});
  }

  const entityColl = entityCollectionMap[role];
  const secColl = securityCollectionMap[role];
  const entityDocId = role === 'admin' ? 'auth_pin' : entityId;

  const entityRef = doc(db, entityColl, entityDocId);
  const securitySessionRef = doc(db, secColl, uid);

  await runTransaction(db, async (transaction) => {
    const entitySnap = await transaction.get(entityRef);
    if (entitySnap.exists()) {
      const data = entitySnap.data();
      if (data?.currentSessionId === sessionId) {
        transaction.update(entityRef, {
          currentSessionId: null
        });
      }
    }

    const secSnap = await transaction.get(securitySessionRef);
    if (secSnap.exists()) {
      const secData = secSnap.data();
      if (secData?.sessionId === sessionId) {
        transaction.update(securitySessionRef, {
          isActive: false,
          lastActive: serverTimestamp()
        });
      }
    }
  }).catch((err) => {
    console.warn('releaseEntitySession failed:', err);
  });
};

export const refreshEntitySession = async ({ role, entityId, sessionId, uid }: ClaimSessionParams): Promise<void> => {
  if (!role || !entityId || !sessionId || !uid) return;

  const entityColl = entityCollectionMap[role];
  const secColl = securityCollectionMap[role];
  const entityDocId = role === 'admin' ? 'auth_pin' : entityId;

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

// Legacy backward compatibility
export const attemptGarageLogin = async (garageId: string, deviceId?: string): Promise<string> => {
  const sid = deviceId || getCanonicalSessionId();
  await claimEntitySession({
    role: 'garage',
    entityId: garageId,
    sessionId: sid,
    uid: garageId
  });
  return sid;
};

export const releaseGarageSession = async (garageId: string): Promise<void> => {
  const sid = getCanonicalSessionId();
  await releaseEntitySession({
    role: 'garage',
    entityId: garageId,
    sessionId: sid,
    uid: garageId
  });
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
