export type AuthorizationPrincipal = Readonly<{
  role?: unknown;
  garageId?: unknown;
}>;

export function canInvalidateAllSessions(principal: AuthorizationPrincipal | null | undefined): boolean {
  return principal?.role === 'admin';
}

export function canUpdateAdminPin(principal: AuthorizationPrincipal | null | undefined): boolean {
  return principal?.role === 'admin';
}

/**
 * Decides whether a principal may manage garage-scoped records.
 * This pure policy intentionally preserves the current route contract:
 * admins are global, while garage owners and staff are scoped to their garage.
 */
export function canManageGarageScopedData(
  principal: AuthorizationPrincipal | null | undefined,
  targetGarageId: string,
): boolean {
  if (!principal) return false;
  if (principal.role === 'admin') return true;
  return (principal.role === 'garage' || principal.role === 'staff') && principal.garageId === targetGarageId;
}

export {};

export type ActiveAdminSession = Readonly<{
  isActive?: unknown;
  sessionId?: unknown;
}>;

export function canClaimAdminSession(input: Readonly<{
  hasValidAdminPin: boolean;
  activeSession: ActiveAdminSession | null;
  requestedSessionId: string;
}>): boolean {
  if (input.hasValidAdminPin) return true;
  return input.activeSession?.isActive === true && input.activeSession.sessionId === input.requestedSessionId;
}

export function canReleaseSession(input: Readonly<{
  actorUid: unknown;
  targetUid: unknown;
  isActiveAdmin: boolean;
  isActiveSupervisor: boolean;
}>): boolean {
  if (input.actorUid === input.targetUid) return true;
  return input.isActiveAdmin || input.isActiveSupervisor;
}

export function canUpdateTrialDecision(
  principal: AuthorizationPrincipal | null | undefined,
  targetGarageId: string,
  decision: 'continued' | 'declined' | null,
): boolean {
  if (!principal) return false;
  if (principal.role === 'admin') return true;
  return principal.role === 'garage' && principal.garageId === targetGarageId && decision !== null;
}
