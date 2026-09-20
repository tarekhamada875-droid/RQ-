import { SessionSchema, type Session } from '../contracts/entities.js';
import { AuthorizationContextSchema, type AuthorizationContext, type SessionValidationResult } from '../contracts/auth.js';

const DEFAULT_INACTIVITY_MS = 15 * 60 * 1000;

export function validateSession(input: Readonly<{
  tokenUid?: string;
  presentedSessionId?: string;
  session: Session;
  now: Date;
  inactivityMs?: number;
}>): SessionValidationResult {
  const session = SessionSchema.parse(input.session);
  if (!input.tokenUid) return { valid: false, reason: 'missing_token' };
  if (session.uid !== input.tokenUid) return { valid: false, reason: 'owner_mismatch' };
  if (!input.presentedSessionId || session.id !== input.presentedSessionId) return { valid: false, reason: 'session_mismatch' };
  if (session.revoked) return { valid: false, reason: 'revoked' };
  const now = input.now.getTime();
  const expiresAt = Date.parse(session.expiresAt);
  const lastActiveAt = Date.parse(session.lastActiveAt);
  if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || !Number.isFinite(lastActiveAt)) throw new Error('Invalid session date');
  if (now >= expiresAt) return { valid: false, reason: 'expired' };
  const inactivityMs = input.inactivityMs ?? DEFAULT_INACTIVITY_MS;
  if (!Number.isInteger(inactivityMs) || inactivityMs < 1) throw new Error('Invalid inactivity window');
  if (now - lastActiveAt > inactivityMs) return { valid: false, reason: 'stale' };
  const context: AuthorizationContext = AuthorizationContextSchema.parse({
    uid: session.uid,
    sessionId: session.id,
    role: session.role,
    garageId: session.garageId,
    delegateGarageIds: session.delegateGarageIds
  });
  return { valid: true, reason: 'valid', context };
}
