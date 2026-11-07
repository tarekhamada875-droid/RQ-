import { useCallback, useState } from 'react';

/**
 * useAsyncAction — a hook for async operations that need loading state.
 *
 * Audit ref: Phase 7 / D5 (consolidated audit, 2026-11-06).
 *
 * Replaces the repeated pattern:
 *   const [isLoading, setIsLoading] = useState(false);
 *   const handler = async () => {
 *     setIsLoading(true);
 *     try {
 *       await doSomething();
 *     } catch (e) {
 *       console.error('...', e);
 *     } finally {
 *       setIsLoading(false);
 *     }
 *   };
 *
 * With:
 *   const { isLoading, run } = useAsyncAction();
 *   const handler = () => run(async () => { await doSomething(); });
 *
 * Benefits:
 *   - Impossible to forget setIsLoading(false) in a finally block
 *   - Impossible to have isLoading stuck true after an error
 *   - No try/finally boilerplate
 *   - Reusable across all admin actions (save rates, toggle lock,
 *     update pin, delete garage, etc.)
 */

export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false);

  const run = useCallback(async <T>(
    fn: () => Promise<T>,
    onError?: (error: unknown) => void,
  ): Promise<T | undefined> => {
    setIsLoading(true);
    try {
      return await fn();
    } catch (error) {
      if (onError) {
        onError(error);
      } else {
        console.error('[useAsyncAction] Error:', error);
      }
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, run };
}
