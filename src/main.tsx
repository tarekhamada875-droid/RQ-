import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/layout/ErrorBoundary.tsx';
import { ThemeProvider } from './utils/ThemeContext.tsx';
import { BackHandlerProvider } from './hooks/backHandler.tsx';
import { ToastProvider } from './hooks/toast.tsx';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BackHandlerProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BackHandlerProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);

