/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NO-SKELETONS (owner decision, 2026-11-25): destination resolver for the
 * App gate. Goal: the user never sees a fake preview — every wait shows
 * EITHER the real next screen (login) OR the brand splash (see
 * BrandSplash.tsx) until the real dashboard swaps in.
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
 * The three dashboard shapes are kept distinct so future callers can still
 * tell the destination family apart; the gate currently renders the same
 * brand splash for all of them.
 *
 * Pure and dependency-free ON PURPOSE: the App gate imports this file, and
 * BrandSplash (rendered by main.tsx from the entry chunk) must stay
 * self-contained (no app-module imports) to keep the app-shell lazy
 * boundary intact (see main.tsx PERF comment).
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
