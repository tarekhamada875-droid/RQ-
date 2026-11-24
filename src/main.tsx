import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import { ErrorBoundary } from './components/layout/ErrorBoundary.tsx';
import { ThemeProvider } from './utils/ThemeContext.tsx';
import { BackHandlerProvider } from './hooks/backHandler.tsx';
import { ToastProvider } from './hooks/toast.tsx';
import { GarageInputProvider } from './hooks/garageInput.tsx';
import { ServerTimeProvider } from './hooks/serverTimeContext.tsx';
import { debugRecorder } from './debug/debugRecorder.ts';
import { DebugHud } from './debug/DebugHud.tsx';
import './index.css';

// DEBUG (owner full-project debug session, 2026-11-17): start the black-box
// recorder before anything else so boot-time errors and the very first API
// calls are captured. Purely observational; no behavioral impact.
debugRecorder.init();

// PERF (DevTools runtime audit 2026-11-11): app-shell boundary.
//
// The static `import App` pulled the ENTIRE app module graph — including the
// 404KB firebase/firestore chunk, every service, and every hook — into the
// entry's static import closure. The browser downloaded and evaluated ~1MB of
// JS before the first pixel could paint (the audit measured the render delay
// at 147-154ms on desktop, and script evaluation scales 4-8x worse on the
// low-end phones garages actually use).
//
// `React.lazy` moves that whole graph behind a dynamic import: the shell
// paints a self-contained splash immediately, then the app chunks stream in
// the background. This is deliberately NOT the reverted #711-#714 approach —
// that rewired firebase.ts/auth initialization and created auth-timing races.
// Here firebase.ts stays 100% synchronous; React.lazy only changes WHEN the
// module graph evaluates, and it guarantees the graph (including firestore)
// is fully evaluated before App code runs. No ordering can be violated.
const LazyApp = lazy(() => import('./App.tsx'));

// Self-contained boot splash: no app imports (importing app modules here
// would pull the whole graph into the entry chunk and defeat the React.lazy
// boundary — see the PERF comment above).
//
// LOADING-UX (2026-11-25, owner initiative "A+B+C"): the old BootSplash was
// a spinner + "جاري تحميل البيانات..." — the same generic waiting noise the
// owner flagged as unprofessional. It is now the app's BRAND MOTIF: the
// Egyptian license plate frame on the beige canvas with the "أرق
// لتطوير البرمجيات" footer (mirrors the pre-JS static splash in index.html,
// so HTML paint → BootSplash is seamless). Destination-neutral on purpose:
// the App gate's destination screen (real login / role-matched dashboard
// skeleton — see RoleSkeletons.tsx) takes over within ~100-500ms of mount.
// Static on purpose: no animation, consistent with the app's skeleton
// convention (UI-LIGHT-SPEED).
function BootSplash() {
  return (
    <div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
      <div className="w-full max-w-[320px] border-[3px] border-slate-900 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col select-none bg-white dark:bg-slate-900/90" dir="ltr">
        <div className="h-7 sm:h-8 bg-[#0057b7] border-b-2 border-slate-900/20 flex items-center justify-between px-3 sm:px-4 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-white/40 border border-white/30" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/40 border border-white/30" />
        </div>
        <div className="h-20 sm:h-24 bg-[#fcfcfc] dark:bg-slate-900/90" />
      </div>
      <div className="mt-8 flex items-center justify-center gap-3 select-none text-slate-400 dark:text-slate-500 font-bold text-[10px] tracking-wider uppercase">
        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-slate-200 dark:to-slate-800" />
        <span>أرق لتطوير البرمجيات</span>
        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-slate-200 dark:to-slate-800" />
      </div>
    </div>
  );
}

// Auto-recover from stale chunks on new deployments
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error detected, reloading page to fetch latest version...', event);
  const lastReload = Number(sessionStorage.getItem('last_chunk_reload') || '0');
  const now = Date.now();
  if (now - lastReload > 15000) {
    sessionStorage.setItem('last_chunk_reload', String(now));
    window.location.reload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* DEBUG (owner audit 2026-11-17): outside the provider tree so the
          export button survives provider-level failures and works on every
          view, including the login screen.
          Audit fix (2026-11-21): gated behind ?debug=1 — the HUD previously
          rendered for EVERY user (all garage workers, login screen), exposing
          a debug file export containing sessionId / UA / URL to anyone.
          Open the app with ?debug=1 in the URL to show it. */}
      <DebugHud enabled={new URLSearchParams(window.location.search).has('debug')} />
      <ThemeProvider>
        <BackHandlerProvider>
          <ToastProvider>
            <GarageInputProvider>
              <ServerTimeProvider>
                <Suspense fallback={<BootSplash />}>
                  <LazyApp />
                </Suspense>
              </ServerTimeProvider>
            </GarageInputProvider>
          </ToastProvider>
        </BackHandlerProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
