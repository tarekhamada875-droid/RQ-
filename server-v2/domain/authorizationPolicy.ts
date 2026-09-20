import type { AuthorizationContext } from '../contracts/auth.js';

export type AuthorizationOperation = 'admin_only' | 'garage_read' | 'garage_write' | 'delegate_garage_read';
export type PolicyReason = 'allowed' | 'role_mismatch' | 'cross_tenant' | 'missing_tenant';
export type PolicyDecision = Readonly<{ allowed: boolean; reason: PolicyReason }>;

export function authorize(
  context: AuthorizationContext,
  operation: AuthorizationOperation,
  targetGarageId?: string
): PolicyDecision {
  if (operation === 'admin_only') {
    return context.role === 'admin' ? { allowed: true, reason: 'allowed' } : { allowed: false, reason: 'role_mismatch' };
  }
  if (!targetGarageId) return { allowed: false, reason: 'missing_tenant' };
  if (context.role === 'admin') return { allowed: true, reason: 'allowed' };
  if (operation === 'delegate_garage_read') {
    return context.role === 'delegate' && context.delegateGarageIds.includes(targetGarageId)
      ? { allowed: true, reason: 'allowed' }
      : { allowed: false, reason: context.role === 'delegate' ? 'cross_tenant' : 'role_mismatch' };
  }
  if (context.role === 'garage' || context.role === 'staff' || context.role === 'supervisor') {
    return context.garageId === targetGarageId
      ? { allowed: true, reason: 'allowed' }
      : { allowed: false, reason: 'cross_tenant' };
  }
  return { allowed: false, reason: 'role_mismatch' };
}
