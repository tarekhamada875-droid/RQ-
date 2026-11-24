/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LOADING-UX (2026-11-25, owner initiative "A+B+C"): destination resolver for
 * every waiting screen in the boot chain (static HTML splash → BootSplash →
 * App gate → Suspense fallback). Goal: the user never sees a generic ghost —
 * every wait shows EITHER the real next screen (login) OR a skeleton that
 * mirrors the exact dashboard family they are returning to.
 *
 * The app persists the last view in localStorage (`app_view`, see
 * useGarageApp) plus the last signed-in identities (`app_garage`,
 * `app_staff`, `app_delegate`). That is enough to know, at gate time and
 * BEFORE any auth/network work, which screen the user is headed to:
 *
 *   view=garage            + stored garage/staff → the garage dashboard
 *   view=garage            + nothing stored       → the login screen (the
 *                             redirect effect in App.tsx/AppRoutes sends
 *                             them there right after auth resolves)
 *   view=delegate_dashboard + stored delegate     → the delegate dashboard
 *   view=admin_* (not admin_login) + stored staff → the admin workspace
 *   anything else (login / admin_login / delegate_login / unknown) → login
 *
 * Pure and dependency-free ON PURPOSE: main.tsx's BootSplash imports this
 * file, and BootSplash must stay self-contained (no app-module imports) to
 * keep the app-shell lazy boundary intact (see main.tsx PERF comment).
 */

export type BootShape = 'login' | 'garage' | 'admin' | 'delegate';

export function resolveBootShape(view: string | null | undefined): BootShape {
  const v = (view || 'login').trim().toLowerCase();
  try {
    if (v === 'garage') {
      const hasGarageIdentity = Boolean(
        localStorage.getItem('app_garage') || localStorage.getItem('app_staff'),
      );
      return hasGarageIdentity ? 'garage' : 'login';
    }
    if (v === 'delegate_dashboard') {
      return localStorage.getItem('app_delegate') ? 'delegate' : 'login';
    }
    if (v.startsWith('admin') && v !== 'admin_login') {
      return localStorage.getItem('app_staff') ? 'admin' : 'login';
    }
    // 'login' | 'admin_login' | 'delegate_login' | anything unknown.
    return 'login';
  } catch {
    // localStorage unavailable (private mode, storage disabled) — the safe
    // guess is the login screen, which is also what the redirect effects
    // settle on when no identity can be restored.
    return 'login';
  }
}
