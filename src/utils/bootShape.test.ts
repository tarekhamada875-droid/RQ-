/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveBootShape } from './bootShape';

// LOADING-UX (2026-11-25, owner initiative "A+B+C"): the destination
// resolver decides which screen every full-page wait previews. A wrong
// guess here shows the wrong skeleton, so every branch is pinned.

describe('resolveBootShape', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to login for null/empty/unknown/public views', () => {
    expect(resolveBootShape(null)).toBe('login');
    expect(resolveBootShape(undefined)).toBe('login');
    expect(resolveBootShape('')).toBe('login');
    expect(resolveBootShape('login')).toBe('login');
    expect(resolveBootShape('admin_login')).toBe('login');
    expect(resolveBootShape('delegate_login')).toBe('login');
    expect(resolveBootShape('nonsense_view')).toBe('login');
  });

  it('garage view + stored garage identity → garage', () => {
    localStorage.setItem('app_garage', '{"id":"g1"}');
    expect(resolveBootShape('garage')).toBe('garage');
  });

  it('garage view + stored staff identity → garage (staff run the same dashboard)', () => {
    localStorage.setItem('app_staff', '{"id":"s1"}');
    expect(resolveBootShape('garage')).toBe('garage');
  });

  it('garage view + nothing stored → login (the redirect destination)', () => {
    expect(resolveBootShape('garage')).toBe('login');
  });

  it('admin workspace views + stored staff → admin', () => {
    localStorage.setItem('app_staff', '{"id":"a1"}');
    expect(resolveBootShape('admin_dashboard')).toBe('admin');
    expect(resolveBootShape('admin_garage_details')).toBe('admin');
    expect(resolveBootShape('admin_delegate_details')).toBe('admin');
  });

  it('admin workspace views without staff → login', () => {
    expect(resolveBootShape('admin_dashboard')).toBe('login');
    expect(resolveBootShape('admin_garage_details')).toBe('login');
  });

  it('delegate dashboard + stored delegate → delegate; without → login', () => {
    expect(resolveBootShape('delegate_dashboard')).toBe('login');
    localStorage.setItem('app_delegate', '{"id":"d1"}');
    expect(resolveBootShape('delegate_dashboard')).toBe('delegate');
  });

  it('is case-insensitive and tolerant of stray whitespace', () => {
    localStorage.setItem('app_staff', '{"id":"a1"}');
    expect(resolveBootShape(' ADMIN_DASHBOARD ')).toBe('admin');
    localStorage.setItem('app_garage', '{"id":"g1"}');
    expect(resolveBootShape('Garage')).toBe('garage');
  });
});
