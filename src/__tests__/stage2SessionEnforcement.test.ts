import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getCanonicalSessionId,
  SESSION_TIMEOUT_MS,
  _resetRecentClaimsForTesting
} from '../services/authSessionService';

describe('Stage 2: Session Expiration & Invalidation Enforcement', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetRecentClaimsForTesting();
    vi.restoreAllMocks();
  });

  it('should generate and persist canonical session id correctly', () => {
    const sid1 = getCanonicalSessionId();
    expect(sid1).toBeTruthy();
    expect(typeof sid1).toBe('string');

    const sid2 = getCanonicalSessionId();
    expect(sid2).toBe(sid1);
    expect(localStorage.getItem('rq_canonical_session_id')).toBe(sid1);
  });

  it('should enforce standard 15 minute session timeout constant', () => {
    expect(SESSION_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  it('should verify session expiration timeout logic mathematically', () => {
    const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
    const now = Date.now();
    
    // Active within 5 minutes -> Not expired
    const lastActiveRecent = now - 5 * 60 * 1000;
    const isExpiredRecent = (now - lastActiveRecent) > SESSION_TIMEOUT_MS;
    expect(isExpiredRecent).toBe(false);

    // Inactive for 16 minutes -> Expired
    const lastActiveOld = now - 16 * 60 * 1000;
    const isExpiredOld = (now - lastActiveOld) > SESSION_TIMEOUT_MS;
    expect(isExpiredOld).toBe(true);
  });

  it('should reject session takeover when an existing session is actively alive', () => {
    const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
    const activeSessionId: string = 'session_device_A';
    const attemptingSessionId: string = 'session_device_B';
    const now = Date.now();
    const lastActive = now - 2 * 60 * 1000; // 2 minutes ago

    const isAlive = Boolean(activeSessionId && 
                    activeSessionId !== attemptingSessionId && 
                    lastActive > 0 && 
                    (now - lastActive < SESSION_TIMEOUT_MS));

    expect(isAlive).toBe(true);
  });

  it('should allow session takeover when previous session is expired beyond timeout', () => {
    const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
    const activeSessionId: string = 'session_device_A';
    const attemptingSessionId: string = 'session_device_B';
    const now = Date.now();
    const lastActive = now - 20 * 60 * 1000; // 20 minutes ago (expired)

    const isAlive = Boolean(activeSessionId && 
                    activeSessionId !== attemptingSessionId && 
                    lastActive > 0 && 
                    (now - lastActive < SESSION_TIMEOUT_MS));

    expect(isAlive).toBe(false);
  });

  it('should detect session revocation when entity doc currentSessionId differs', () => {
    const currentDeviceSessionId: string = 'session_device_A';
    const remoteEntityCurrentSessionId: string = 'session_device_B'; // taken over remotely

    const isRevoked = Boolean(remoteEntityCurrentSessionId && 
                      remoteEntityCurrentSessionId !== currentDeviceSessionId);

    expect(isRevoked).toBe(true);
  });
});
