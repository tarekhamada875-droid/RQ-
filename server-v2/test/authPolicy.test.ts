import { describe, expect, it } from 'vitest';
import type { Session } from '../contracts/entities.js';
import { authorize } from '../domain/authorizationPolicy.js';
import { validateSession } from '../domain/sessionPolicy.js';

const now = new Date('2026-09-20T10:00:00.000Z');
const baseSession: Session = {
  id: 'session-1', uid: 'uid-1', role: 'garage', garageId: 'garage-1', delegateGarageIds: [],
  expiresAt: '2026-09-20T12:00:00.000Z', lastActiveAt: '2026-09-20T09:55:00.000Z', revoked: false
};

describe('v2 authentication and authorization policy', () => {
  it.each([
    [undefined, 'session-1', 'missing_token'],
    ['uid-2', 'session-1', 'owner_mismatch'],
    ['uid-1', 'session-other', 'session_mismatch'],
    ['uid-1', 'session-1', 'valid']
  ])('validates identity and canonical session ownership: %o', (tokenUid, sessionId, reason) => {
    const result = tokenUid === undefined
      ? validateSession({ presentedSessionId: sessionId, session: baseSession, now })
      : validateSession({ tokenUid, presentedSessionId: sessionId, session: baseSession, now });
    expect(result.reason).toBe(reason);
    expect(result.valid).toBe(reason === 'valid');
  });

  it.each([
    [{ ...baseSession, revoked: true }, 'revoked'],
    [{ ...baseSession, expiresAt: '2026-09-20T09:59:59.000Z' }, 'expired'],
    [{ ...baseSession, lastActiveAt: '2026-09-20T09:40:00.000Z' }, 'stale']
  ])('rejects invalid session state: %o', (session, reason) => {
    expect(validateSession({ tokenUid: 'uid-1', presentedSessionId: 'session-1', session, now }).reason).toBe(reason);
  });

  it('builds a typed authorization context for a valid session', () => {
    const result = validateSession({ tokenUid: 'uid-1', presentedSessionId: 'session-1', session: baseSession, now });
    expect(result.context).toMatchObject({ uid: 'uid-1', sessionId: 'session-1', role: 'garage', garageId: 'garage-1' });
  });

  it.each([
    ['admin', 'admin_only', undefined, true, 'allowed'],
    ['garage', 'admin_only', undefined, false, 'role_mismatch'],
    ['garage', 'garage_read', 'garage-1', true, 'allowed'],
    ['garage', 'garage_read', 'garage-2', false, 'cross_tenant'],
    ['delegate', 'delegate_garage_read', 'garage-2', true, 'allowed'],
    ['delegate', 'delegate_garage_read', 'garage-3', false, 'cross_tenant'],
    ['staff', 'delegate_garage_read', 'garage-1', false, 'role_mismatch']
  ])('enforces role and tenant policy for %s', (role, operation, targetGarageId, allowed, reason) => {
    const context = {
      uid: 'uid-1', sessionId: 'session-1', role: role as 'admin' | 'supervisor' | 'delegate' | 'garage' | 'staff',
      garageId: role === 'garage' || role === 'staff' || role === 'supervisor' ? 'garage-1' : undefined,
      delegateGarageIds: role === 'delegate' ? ['garage-2'] : []
    };
    expect(authorize(context, operation as 'admin_only' | 'garage_read' | 'garage_write' | 'delegate_garage_read', targetGarageId)).toEqual({ allowed, reason });
  });
});
