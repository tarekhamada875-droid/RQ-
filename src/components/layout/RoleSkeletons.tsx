/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useNavigationUi } from '../../hooks/navigationUiContext';
import { resolveBootShape } from '../../utils/bootShape';
import { LoginView } from '../auth/LoginView';
import { PageSkeleton } from './LoadingFallbacks';

// LOADING-UX (2026-11-25, owner initiative "A+B+C"): destination previews.
//
// The generic PageSkeleton (gray blocks + spinner + "جاري التحميل...") showed
// the SAME ghost for every entry — PIN login, garage, admin, delegate — so it
// matched nothing and read as unprofessional (owner screenshot 2026-11-24).
// Since the persisted view + stored identities already tell us which screen
// is coming (see resolveBootShape), every full-page wait now shows:
//
//   A) headed to a login view  → the REAL login screen (it is fully static —
//      plate + keypad need zero data — so we render the real thing, not a
//      preview of it);
//   B) headed to a dashboard   → a static skeleton that mirrors THAT
//      dashboard's real layout (same header shape, same cards, same order),
//      so a slow load reads as "the screen filling in", not "something
//      broke";
//   C) fast re-gates           → nothing at all (DelayedFallback 250ms, and
//      the first gate renders immediately so the handoff from main.tsx's
//      BootSplash stays seamless).
//
// All skeletons are STATIC by convention (UI-LIGHT-SPEED: no pulse/animation
// on skeletons) and use the app's own canvas (#faf9f6) with slate ghost
// blocks. Layout numbers mirror the real components they preview:
//   - GarageDashboardSkeleton  ← GarageDashboardHeaderAndDrawer,
//                                GarageSubscriptionCard, RegistrationCard,
//                                GarageActiveCountCard
//   - AdminDashboardSkeleton   ← AdminHeader + AdminNavigationAndViews
//   - DelegateDashboardSkeleton← DelegateDashboardView header + cards

export function GarageDashboardSkeleton() {
  return (
    <div
      className="h-screen h-[100dvh] bg-[#faf9f6] dark:bg-transparent font-sans w-full flex flex-col items-center overflow-hidden relative"
      dir="rtl"
      aria-hidden="true"
    >
      {/* Header: dark name pill + dark menu square (mirrors the real header) */}
      <header className="bg-[#faf9f6] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 z-40 w-full shrink-0">
        <div className="max-w-4xl mx-auto flex justify-between items-center w-full">
          <div className="h-11 w-36 bg-slate-900 dark:bg-slate-800 rounded-2xl" />
          <div className="w-11 h-11 bg-slate-900 dark:bg-slate-800 rounded-2xl" />
        </div>
      </header>

      <main className="max-w-md md:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto p-4 w-full flex-1 flex flex-col gap-4">
        {/* Subscription / prepaid-credit card */}
        <div className="h-28 md:h-32 rounded-[1.75rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 w-full" />

        {/* Registration card: the Egyptian plate input + check-in actions */}
        <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-8 w-full flex flex-col gap-4">
          <div
            className="h-28 sm:h-36 rounded-xl border-2 md:border-[3px] border-slate-900 dark:border-slate-700 overflow-hidden flex flex-col bg-white dark:bg-slate-900/90"
            dir="ltr"
          >
            <div className="h-8 sm:h-11 bg-[#0057b7] border-b-2 border-slate-900/20 flex items-center justify-between px-3 sm:px-6 shrink-0">
              <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-white/40 border border-white/30" />
              <span className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 rounded-full bg-white/40 border border-white/30" />
            </div>
            <div className="flex-1 bg-[#fcfcfc] dark:bg-slate-900/90" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 py-5 rounded-2xl bg-emerald-500/15 dark:bg-emerald-500/10" />
            <div className="flex-1 py-5 rounded-2xl bg-emerald-500/15 dark:bg-emerald-500/10" />
          </div>
        </div>

        {/* Cars-inside count card with its circular gauge */}
        <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pt-4 pb-6 w-full flex flex-col items-center gap-3">
          <div className="h-6 w-44 rounded-full bg-slate-200/80 dark:bg-slate-800/60" />
          <div className="w-16 h-16 rounded-full border-4 border-slate-200 dark:border-slate-800" />
        </div>
      </main>
    </div>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div
      className="h-screen h-[100dvh] bg-[#faf9f6] dark:bg-transparent font-sans w-full flex flex-col overflow-hidden relative"
      dir="rtl"
      aria-hidden="true"
    >
      {/* AdminHeader: shield square + workspace title + side controls */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 w-full shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center w-full">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-slate-900 dark:bg-slate-800 rounded-xl" />
            <div className="h-9 w-28 rounded-xl bg-slate-200/80 dark:bg-slate-800/60" />
          </div>
          <div className="w-11 h-11 bg-slate-900 dark:bg-slate-800 rounded-xl" />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8 flex-1 w-full flex flex-col gap-3">
        {/* Search bar */}
        <div className="h-11 rounded-xl bg-slate-200/60 dark:bg-slate-800/40 w-full" />
        {/* Garage list cards */}
        <div className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800/50 w-full" />
        <div className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800/50 w-full" />
        <div className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800/50 w-full" />
        <div className="h-24 rounded-2xl bg-slate-200/70 dark:bg-slate-800/50 w-full" />
      </main>
    </div>
  );
}

export function DelegateDashboardSkeleton() {
  return (
    <div
      className="h-screen h-[100dvh] bg-[#faf9f6] dark:bg-transparent font-sans w-full flex flex-col overflow-hidden relative"
      dir="rtl"
      aria-hidden="true"
    >
      {/* Delegate header: name pill + menu square */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 w-full shrink-0">
        <div className="max-w-4xl mx-auto flex justify-between items-center w-full">
          <div className="h-11 w-40 bg-slate-900 dark:bg-slate-800 rounded-2xl" />
          <div className="w-11 h-11 bg-slate-900 dark:bg-slate-800 rounded-2xl" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 w-full flex-1 flex flex-col gap-5">
        {/* The amber summary card */}
        <div className="rounded-3xl border border-amber-200 dark:border-amber-900/60 bg-amber-500/10 dark:bg-amber-500/5 p-6 w-full flex flex-col gap-3">
          <div className="h-6 w-36 rounded-lg bg-slate-200/80 dark:bg-slate-800/60" />
          <div className="h-12 rounded-xl bg-slate-200/70 dark:bg-slate-800/50 w-full" />
        </div>
        {/* Garage list cards */}
        <div className="h-28 rounded-3xl bg-slate-200/70 dark:bg-slate-800/50 w-full" />
        <div className="h-28 rounded-3xl bg-slate-200/70 dark:bg-slate-800/50 w-full" />
      </main>
    </div>
  );
}

export interface DestinationScreenLoginProps {
  loginPhone: string;
  setLoginPhone: (phone: string) => void;
  handleGarageLogin: () => Promise<void>;
  isLoading: boolean;
  closeKeyboard: () => void;
}

/**
 * The screen a full-page wait should show for the given view:
 * the real login screen (A) or the matching dashboard skeleton (B).
 *
 * `loginProps` is REQUIRED for the login destination and comes from the
 * caller's state/contexts — in App.tsx the gate renders BEFORE the provider
 * tree mounts, so the props are passed straight from the `app` object there;
 * context-based callers can use SuspenseRoleSkeleton instead (login views
 * never suspend, so it never needs the login props).
 */
export function DestinationScreen({
  view,
  loginProps,
}: {
  view: string;
  loginProps?: DestinationScreenLoginProps;
}) {
  const shape = resolveBootShape(view);
  if (shape === 'garage') return <GarageDashboardSkeleton />;
  if (shape === 'admin') return <AdminDashboardSkeleton />;
  if (shape === 'delegate') return <DelegateDashboardSkeleton />;
  if (loginProps) {
    // (A) The login screen is fully static — plate + keypad need no data —
    // so a cold start shows the REAL screen immediately instead of a preview
    // of it. Keypad/button disabling while !isAuthReady is already built
    // into LoginView via isLoading.
    return (
      <LoginView
        loginPhone={loginProps.loginPhone}
        setLoginPhone={loginProps.setLoginPhone}
        handleGarageLogin={loginProps.handleGarageLogin}
        isLoading={loginProps.isLoading}
        closeKeyboard={loginProps.closeKeyboard}
      />
    );
  }
  // Unreachable in practice: a login destination only occurs in the App gate
  // (which always passes loginProps) or on views that render LoginView
  // statically and therefore never suspend into the Suspense fallback.
  // Kept as an honest safety net — the silent generic ghost.
  return <PageSkeleton />;
}

/**
 * Context-based wrapper for the App-level Suspense boundary in App.tsx
 * (lazy dashboard chunks downloading). Dashboard views are the only ones
 * that can suspend there (LoginView is statically imported), so the login
 * props are never needed — the shape resolver alone decides.
 */
export function SuspenseRoleSkeleton() {
  const { view } = useNavigationUi();
  return <DestinationScreen view={view} />;
}
