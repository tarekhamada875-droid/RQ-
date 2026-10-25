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

export { SESSION_TIMEOUT_MS } from '../domain/auth/sessionPolicy';

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
  } catch {
    return 'fallback_session_' + Date.now();
  }
};


// In-memory cache to prevent duplicate Firestore transaction collisions within the same client session
const recentClaims = new Map<string, number>();

// A logout release and a new login can overlap in the same tab. Serialize them
// for the same role/entity/session so an older release cannot erase a newer claim.
const pendingSessionReleases = new Map<string, Promise<void>>();
const getSessionOperationKey = (role: string, entityId: string, sessionId: string): string =>
  JSON.stringify([role, entityId, sessionId]);

const notifyWorkerSessionReady = (): void => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rq-session-ready'));
};

export const _resetRecentClaimsForTesting = () => {
  recentClaims.clear();
};

export const recordSessionAsClaimed = (role: string, entityId: string, sessionId: string, uid: string): void => {
  if (!role || !entityId || !sessionId || !uid) return;
  const claimKey = `${role}_${entityId}_${sessionId}_${uid}`;
  recentClaims.set(claimKey, Date.now());
  notifyWorkerSessionReady();
};

const waitForPendingSessionRelease = async (
  params: ClaimSessionParams,
  operationKey: string,
  pendingRelease: Promise<void>
): Promise<void> => {
  try {
    await pendingRelease;
    return;
  } catch {
    // A failed release must not permanently block this session, but a claim
    // must never race ahead of a retry that could revoke it on the server.
    const latestRelease = pendingSessionReleases.get(operationKey);
    if (!latestRelease) {
      // Another release completed successfully and cleared the entry.
      return;
    }
    if (latestRelease !== pendingRelease) {
      // Another claimant already started the shared retry. Wait for it rather
      // than issuing overlapping releases for the same session.
      await latestRelease;
      return;
    }

    const retryPromise = authService.releaseSessionOnServer(
      params.uid,
      params.sessionId,
      params.role,
      params.entityId
    );
    pendingSessionReleases.set(operationKey, retryPromise);

    // On failure, deliberately retain the rejected promise so a future claim
    // retries again instead of proceeding while server revocation is uncertain.
    await retryPromise;
    if (pendingSessionReleases.get(operationKey) === retryPromise) {
      pendingSessionReleases.delete(operationKey);
    }
  }
};

export const claimEntitySession = async ({ role, entityId, sessionId, uid, pin }: ClaimSessionParams): Promise<void> => {
  if (!role || !entityId || !sessionId || !uid) {
    throw new Error('INVALID_SESSION_PARAMS');
  }

  const operationKey = getSessionOperationKey(role, entityId, sessionId);
  const pendingRelease = pendingSessionReleases.get(operationKey);
  if (pendingRelease) {
    await waitForPendingSessionRelease({ role, entityId, sessionId, uid, pin }, operationKey, pendingRelease);
  }

  const claimKey = `${role}_${entityId}_${sessionId}_${uid}`;
  const now = Date.now();
  const lastClaimTime = recentClaims.get(claimKey);
  if (lastClaimTime && (now - lastClaimTime < 10000)) {
    return;
  }

  // 1. Authoritative Server Validation / Heartbeat Refresh.
  // A confirmed invalid result must never fall through to browser writes: a
  // matching legacy session document can still permit heartbeat-only Firestore
  // updates even though the Worker has explicitly rejected the session.
  let serverConfirmedInvalid = false;
  try {
    const isValidOnServer = await authService.validateOrRefreshSessionOnServer(uid, sessionId, role, entityId);
    if (isValidOnServer) {
      recentClaims.set(claimKey, Date.now());
      notifyWorkerSessionReady();
      return;
    }
    serverConfirmedInvalid = true;
  } catch (err) {
    // A transport/server error is not proof of revocation. The existing
    console.warn('Server session validation unavailable; failing closed:', err);
  }

  // 2. For Admin role: Use authoritative Server API with PIN or existing token
  if (role === 'admin') {
    try {
      const serverClaim = await authService.claimAdminSessionOnServer(uid, sessionId, pin);
      if (serverClaim.success) {
        recentClaims.set(claimKey, Date.now());
        notifyWorkerSessionReady();
        return;
      }
      if (serverClaim.error === 'SESSION_OCCUPIED') {
        throw new Error('SESSION_OCCUPIED');
      }
    } catch (err: any) {
      if (err?.message === 'SESSION_OCCUPIED') {
        throw err;
      }
      console.warn('Server admin session claim failed:', err);
    }
  }

  // The Worker is the only session authority. If it could not confirm the session
  // (offline or server error), fail closed; the browser never writes session records.
  throw new Error(serverConfirmedInvalid ? 'SESSION_INVALID' : 'SESSION_SERVER_UNAVAILABLE');
};

export const releaseEntitySession = async ({ role, entityId, sessionId, uid }: ClaimSessionParams): Promise<void> => {
  if (!role || !entityId || !sessionId || !uid) return;

  const claimKey = `${role}_${entityId}_${sessionId}_${uid}`;
  recentClaims.delete(claimKey);

  // The server owns the security documents. Serialize this release against any
  // new claim for the same role/entity/session. Never write session docs here.
  const operationKey = getSessionOperationKey(role, entityId, sessionId);
  const releasePromise = authService.releaseSessionOnServer(uid, sessionId, role, entityId);
  pendingSessionReleases.set(operationKey, releasePromise);

  try {
    await releasePromise;
    if (pendingSessionReleases.get(operationKey) === releasePromise) {
      pendingSessionReleases.delete(operationKey);
    }
  } catch (error) {
    // Keep the rejected promise so subsequent claims fail closed. A later
    // successful release replaces and clears it.
    throw error;
  }
};

export const refreshEntitySession = async ({ role, entityId, sessionId, uid }: ClaimSessionParams): Promise<boolean | null> => {
  if (!role || !entityId || !sessionId || !uid) return null;
  try {
    // Session freshness and entity heartbeat are server-authoritative. The
    // browser may request a refresh, but it must not write security or entity
    // session fields directly because that creates a second authority beside
    // /api/auth/validate-or-refresh-session.
    const valid = await authService.validateOrRefreshSessionOnServer(
      uid,
      sessionId,
      role,
      entityId
    );
    if (!valid) {
      console.warn('[AuthSessionService] Server rejected session refresh', { role, entityId });
      return false;
    }
    return true;
  } catch (err) {
    // A transport/server failure is not proof of revocation. Let the caller
    // preserve the current session while retrying on the next heartbeat.
    console.warn('refreshEntitySession failed:', err);
    return null;
  }
};
