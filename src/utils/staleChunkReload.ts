/**
 * Stale-chunk reload guard — the single home for the "reload on stale deploy"
 * throttle logic.
 *
 * Audit F-17 (Phase 4a, 2026-11-26): previously this logic was duplicated in
 * two places with identical 15-second throttle semantics:
 *   1. main.tsx's `vite:preloadError` event listener (fires when a dynamically
 *      imported chunk 404s after a new deployment).
 *   2. ErrorBoundary.tsx's `componentDidCatch` (fires when a chunk-load error
 *      surfaces as a React render error).
 *
 * Both used the same `last_chunk_reload` sessionStorage key and the same 15s
 * gap. Drift between them would mean reload loops (too-short gap) or a stuck
 * user after a deployment (too-long gap). One shared function makes the drift
 * impossible.
 */

const RELOAD_THROTTLE_MS = 15_000;
const RELOAD_KEY = 'last_chunk_reload';

/**
 * Reload the page to fetch the latest deployment, but only if at least
 * `RELOAD_THROTTLE_MS` (15s) has passed since the last reload. This prevents
 * reload loops when multiple chunk errors fire in quick succession.
 *
 * @returns `true` if the reload was triggered, `false` if throttled.
 */
export function reloadIfStaleChunk(): boolean {
  try {
    const lastReload = Number(sessionStorage.getItem(RELOAD_KEY) || '0');
    const now = Date.now();
    if (now - lastReload > RELOAD_THROTTLE_MS) {
      sessionStorage.setItem(RELOAD_KEY, String(now));
      window.location.reload();
      return true;
    }
  } catch (storageError) {
    // sessionStorage may be unavailable (private browsing, quota). Failing
    // silently is safer than blocking the reload — the worst case is a reload
    // loop, which the browser's own reload limit will eventually break.
    console.warn('تعذر قراءة حالة تحديث الصفحة.', storageError);
  }
  return false;
}

/**
 * Classify whether an error is a stale-chunk (failed dynamic import) error.
 * Used by ErrorBoundary to decide whether to show the "auto-reloading" branch
 * and whether to call `reloadIfStaleChunk`.
 */
export function isStaleChunkError(error: Error | undefined | null): boolean {
  if (!error) return false;
  const message = error.message || '';
  return message.includes('dynamically imported module') ||
    message.includes('Failed to fetch') ||
    message.includes('Loading chunk') ||
    message.includes('Importing a module script failed');
}
