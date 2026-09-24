export type AuthorizationPrincipal = Readonly<{
  role?: unknown;
  garageId?: unknown;
}>;

export type VehicleGarageScopeDecision =
  | Readonly<{ allowed: true; garageId: unknown }>
  | Readonly<{ allowed: false; reason: 'garage_id_missing' | 'garage_scope_mismatch' | 'role_not_authorized' }>;

export function authorizeVehicleGarageScope(
  principal: AuthorizationPrincipal | null | undefined,
  requestedGarageId: unknown
): VehicleGarageScopeDecision {
  if (principal?.role === 'admin') {
    return {
      allowed: true,
      garageId: requestedGarageId
    };
  }

  if (principal?.role !== 'garage' && principal?.role !== 'staff') {
    return { allowed: false, reason: 'role_not_authorized' };
  }

  if (typeof principal.garageId !== 'string' || !principal.garageId) {
    return { allowed: false, reason: 'garage_id_missing' };
  }
  if (requestedGarageId && requestedGarageId !== principal.garageId) {
    return { allowed: false, reason: 'garage_scope_mismatch' };
  }

  return { allowed: true, garageId: principal.garageId };
}

export const ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS = [
  'recalculate-cars-inside',
  'reconciliation',
  'dashboard-summary/rebuild',
  'rebuild-projections'
] as const;

export type GarageMaintenanceOperation = typeof ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS[number];

export function canRunGarageMaintenance(
  principal: AuthorizationPrincipal | null | undefined,
  operation: GarageMaintenanceOperation
): boolean {
  return principal?.role === 'admin' && ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS.includes(operation);
}

export function canInvalidateAllSessions(principal: AuthorizationPrincipal | null | undefined): boolean {
  return principal?.role === 'admin';
}

export function canUpdateAdminPin(principal: AuthorizationPrincipal | null | undefined): boolean {
  return principal?.role === 'admin';
}

export function canViewFinancialReport(principal: AuthorizationPrincipal | null | undefined): boolean {
  return principal?.role === 'admin';
}

export function canSubmitGarageApplication(principal: AuthorizationPrincipal | null | undefined): boolean {
  return principal?.role === 'admin' || principal?.role === 'delegate';
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
