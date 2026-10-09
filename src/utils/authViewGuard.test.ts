import { describe, expect, it } from 'vitest';
import { shouldWaitForSessionReady } from './authViewGuard';

describe('auth view guard', () => {
  it('blocks persisted protected views until the authoritative session is ready', () => {
    expect(shouldWaitForSessionReady('admin_dashboard', false)).toBe(true);
    expect(shouldWaitForSessionReady('garage', false)).toBe(true);
    expect(shouldWaitForSessionReady('delegate_dashboard', false)).toBe(true);
  });

  it('allows public login views before a session is established', () => {
    expect(shouldWaitForSessionReady('login', false)).toBe(false);
    expect(shouldWaitForSessionReady('admin_login', false)).toBe(false);
    expect(shouldWaitForSessionReady('delegate_login', false)).toBe(false);
  });

  it('allows protected views after authoritative session readiness', () => {
    expect(shouldWaitForSessionReady('admin_dashboard', true)).toBe(false);
    expect(shouldWaitForSessionReady('garage', true)).toBe(false);
  });
});
