import { describe, expect, it } from 'vitest';
import {
  canClaimAdminSession,
  canInvalidateAllSessions,
  canManageGarageScopedData,
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
