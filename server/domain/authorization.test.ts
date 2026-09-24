import { describe, expect, it } from 'vitest';
import {
  ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS,
  authorizeVehicleGarageScope,
  canClaimAdminSession,
  canInvalidateAllSessions,
  canManageGarageScopedData,
  canRunGarageMaintenance,
  canViewFinancialReport,
  canReleaseSession,
  canUpdateAdminPin,
  canUpdateTrialDecision
} from './authorization';

describe('garage-scoped authorization policy', () => {
  it('preserves global admin access', () => {
    expect(canManageGarageScopedData({ role: 'admin', garageId: 'garage_other' }, 'garage_target')).toBe(true);
  });

  it.each(['garage', 'staff'])('allows %s access only to the matching garage', (role) => {
    expect(canManageGarageScopedData({ role, garageId: 'garage_target' }, 'garage_target')).toBe(true);
    expect(canManageGarageScopedData({ role, garageId: 'garage_other' }, 'garage_target')).toBe(false);
  });

  it('denies unsupported roles, missing principals, and incomplete scope', () => {
    expect(canManageGarageScopedData({ role: 'delegate', garageId: 'garage_target' }, 'garage_target')).toBe(false);
    expect(canManageGarageScopedData({ role: 'anonymous', garageId: 'garage_target' }, 'garage_target')).toBe(false);
    expect(canManageGarageScopedData({ role: 'garage' }, 'garage_target')).toBe(false);
    expect(canManageGarageScopedData(undefined, 'garage_target')).toBe(false);
    expect(canManageGarageScopedData(null, 'garage_target')).toBe(false);
  });
});

export {};

describe('admin-session authorization policy', () => {
  it('allows a claim with a verified admin PIN', () => {
    expect(canClaimAdminSession({
      hasValidAdminPin: true,
      activeSession: null,
      requestedSessionId: 'device_1'
    })).toBe(true);
  });

  it('allows fallback claims only for the matching active admin session', () => {
    expect(canClaimAdminSession({
      hasValidAdminPin: false,
      activeSession: { isActive: true, sessionId: 'device_1' },
      requestedSessionId: 'device_1'
    })).toBe(true);
    expect(canClaimAdminSession({
      hasValidAdminPin: false,
      activeSession: { isActive: true, sessionId: 'device_other' },
      requestedSessionId: 'device_1'
    })).toBe(false);
    expect(canClaimAdminSession({
      hasValidAdminPin: false,
      activeSession: { isActive: false, sessionId: 'device_1' },
      requestedSessionId: 'device_1'
    })).toBe(false);
  });

  it('allows self-release or release by an active admin/supervisor only', () => {
    const base = { targetUid: 'target_uid', isActiveAdmin: false, isActiveSupervisor: false };
    expect(canReleaseSession({ ...base, actorUid: 'target_uid' })).toBe(true);
    expect(canReleaseSession({ ...base, actorUid: 'other_uid' })).toBe(false);
    expect(canReleaseSession({ ...base, actorUid: 'other_uid', isActiveAdmin: true })).toBe(true);
    expect(canReleaseSession({ ...base, actorUid: 'other_uid', isActiveSupervisor: true })).toBe(true);
  });
});

describe('trial decision authorization policy', () => {
  it('allows an owner to record a choice only for their own garage', () => {
    expect(canUpdateTrialDecision({ role: 'garage', garageId: 'garage_target' }, 'garage_target', 'continued')).toBe(true);
    expect(canUpdateTrialDecision({ role: 'garage', garageId: 'garage_target' }, 'garage_target', 'declined')).toBe(true);
    expect(canUpdateTrialDecision({ role: 'garage', garageId: 'garage_other' }, 'garage_target', 'continued')).toBe(false);
  });

  it('reserves clearing and non-owner changes to admins', () => {
    expect(canUpdateTrialDecision({ role: 'garage', garageId: 'garage_target' }, 'garage_target', null)).toBe(false);
    expect(canUpdateTrialDecision({ role: 'staff', garageId: 'garage_target' }, 'garage_target', 'continued')).toBe(false);
    expect(canUpdateTrialDecision({ role: 'delegate' }, 'garage_target', 'continued')).toBe(false);
    expect(canUpdateTrialDecision({ role: 'admin' }, 'garage_target', null)).toBe(true);
    expect(canUpdateTrialDecision({ role: 'admin' }, 'garage_target', 'declined')).toBe(true);
  });
});

describe('admin maintenance authorization policy', () => {
  it.each([
    ['garage', { role: 'garage' }],
    ['staff', { role: 'staff' }],
    ['delegate', { role: 'delegate' }],
    ['supervisor', { role: 'supervisor' }],
    ['missing principal', undefined],
    ['null principal', null]
  ])('denies session invalidation and PIN changes for %s', (_label, principal) => {
    expect(canInvalidateAllSessions(principal)).toBe(false);
    expect(canUpdateAdminPin(principal)).toBe(false);
  });

  it('allows only the admin role for both decisions', () => {
    const admin = { role: 'admin' };
    expect(canInvalidateAllSessions(admin)).toBe(true);
    expect(canUpdateAdminPin(admin)).toBe(true);
    expect(canInvalidateAllSessions({ role: 'admin' })).toBe(true);
    expect(canUpdateAdminPin({ role: 'admin' })).toBe(true);
  });
});

describe('financial report authorization policy', () => {
  it('allows admins and denies every non-admin or missing principal', () => {
    expect(canViewFinancialReport({ role: 'admin' })).toBe(true);
    for (const role of ['garage', 'staff', 'delegate', 'supervisor', 'backend-operator', 'unknown']) {
      expect(canViewFinancialReport({ role })).toBe(false);
    }
    expect(canViewFinancialReport(undefined)).toBe(false);
    expect(canViewFinancialReport(null)).toBe(false);
  });
});

describe('garage reconciliation and projection maintenance authorization', () => {
  it.each(ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS)('allows admins to run %s', (operation) => {
    expect(canRunGarageMaintenance({ role: 'admin' }, operation)).toBe(true);
  });

  it.each(ADMIN_ONLY_GARAGE_MAINTENANCE_OPERATIONS)('denies non-admins from running %s', (operation) => {
    for (const role of ['garage', 'staff', 'delegate', 'supervisor', 'backend-operator']) {
      expect(canRunGarageMaintenance({ role }, operation)).toBe(false);
    }
    expect(canRunGarageMaintenance(undefined, operation)).toBe(false);
    expect(canRunGarageMaintenance(null, operation)).toBe(false);
  });
});

describe('vehicle operation garage-scope authorization', () => {
  it.each(['garage', 'staff'])('uses the session garage for %s and permits only a matching requested scope', (role) => {
    expect(authorizeVehicleGarageScope({ role, garageId: 'garage_1' }, undefined)).toEqual({
      allowed: true,
      garageId: 'garage_1'
    });
    expect(authorizeVehicleGarageScope({ role, garageId: 'garage_1' }, 'garage_1')).toEqual({
      allowed: true,
      garageId: 'garage_1'
    });
    expect(authorizeVehicleGarageScope({ role, garageId: 'garage_1' }, 'garage_2')).toEqual({
      allowed: false,
      reason: 'garage_scope_mismatch'
    });
  });

  it('preserves the distinct missing-session-garage denial', () => {
    expect(authorizeVehicleGarageScope({ role: 'garage' }, 'garage_1')).toEqual({
      allowed: false,
      reason: 'garage_id_missing'
    });
    expect(authorizeVehicleGarageScope({ role: 'staff', garageId: '' }, undefined)).toEqual({
      allowed: false,
      reason: 'garage_id_missing'
    });
  });

  it('allows admins to target the requested garage and denies unsupported roles', () => {
    expect(authorizeVehicleGarageScope({ role: 'admin' }, 'garage_2')).toEqual({
      allowed: true,
      garageId: 'garage_2'
    });
    expect(authorizeVehicleGarageScope({ role: 'admin' }, undefined)).toEqual({
      allowed: true,
      garageId: undefined
    });
    for (const role of ['delegate', 'supervisor', 'backend-operator']) {
      expect(authorizeVehicleGarageScope({ role, garageId: 'garage_1' }, 'garage_1')).toEqual({
        allowed: false,
        reason: 'role_not_authorized'
      });
    }
    expect(authorizeVehicleGarageScope(undefined, undefined)).toEqual({
      allowed: false,
      reason: 'role_not_authorized'
    });
  });
});
