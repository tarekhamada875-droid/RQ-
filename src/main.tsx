import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import { ErrorBoundary } from './components/layout/ErrorBoundary.tsx';
import { ThemeProvider } from './utils/ThemeContext.tsx';
import { BackHandlerProvider } from './hooks/backHandler.tsx';
import { ToastProvider } from './hooks/toast.tsx';
import { GarageInputProvider } from './hooks/garageInput.tsx';
import { ServerTimeProvider } from './hooks/serverTimeContext.tsx';
import './index.css';

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

// Self-contained boot splash: no app imports, mirrors App's own
// auth-loading UI exactly so the handoff is visually seamless.
function BootSplash() {
  return (
    <div className="w-full h-full min-h-screen bg-[#faf9f6] dark:bg-slate-950 flex flex-col items-center justify-center p-4 text-center font-sans" dir="rtl">
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-slate-600 dark:text-slate-300 font-bold text-sm animate-pulse">جاري تحميل البيانات...</p>
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
