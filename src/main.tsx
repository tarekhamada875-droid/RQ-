import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/layout/ErrorBoundary.tsx';
import { ThemeProvider } from './utils/ThemeContext.tsx';
import { BackHandlerProvider } from './hooks/backHandler.tsx';
import { ToastProvider } from './hooks/toast.tsx';
import { GarageInputProvider } from './hooks/garageInput.tsx';
import { ServerTimeProvider } from './hooks/serverTimeContext.tsx';
import { firebaseReady } from './firebase';
import './index.css';

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

// Wait for Firebase to lazy-load before rendering the app.
// The loading screen in index.html (#root > div) shows "جاري تحميل البيانات..."
// while this promise resolves. Once Firebase auth + firestore are ready,
// the app renders. This prevents the "auth accessed before initialization"
// proxy errors and ensures the first paint is the app, not a crash.
firebaseReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <BackHandlerProvider>
            <ToastProvider>
              <GarageInputProvider>
                <ServerTimeProvider>
                  <App />
                </ServerTimeProvider>
              </GarageInputProvider>
            </ToastProvider>
          </BackHandlerProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}).catch((err) => {
  console.error('Firebase initialization failed:', err);
  document.getElementById('root')!.innerHTML = `
    <div style="padding:2rem;text-align:center;font-family:system-ui;direction:rtl;">
      <h2 style="color:#ef4444;">فشل تحميل التطبيق</h2>
      <p style="color:#64748b;">يرجى تحديث الصفحة أو التحقق من اتصال الإنترنت.</p>
      <button onclick="location.reload()" style="margin-top:1rem;padding:0.75rem 1.5rem;background:#10b981;color:white;border:none;border-radius:0.5rem;cursor:pointer;font-weight:bold;">إعادة المحاولة</button>
    </div>
  `;
});

