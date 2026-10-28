import { ComponentType, lazy } from 'react';

export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    const isRefreshed = sessionStorage.getItem('chunk_reload_retry') === 'true';

    try {
      const component = await componentImport();
      sessionStorage.removeItem('chunk_reload_retry');
      return component;
    } catch (error: any) {
      const isChunkError =
        error?.message?.includes('dynamically imported module') ||
        error?.message?.includes('Failed to fetch') ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Importing a module script failed');

      if (isChunkError && !isRefreshed) {
        sessionStorage.setItem('chunk_reload_retry', 'true');
        window.location.reload();
        // Return a pending promise while the page reloads
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
