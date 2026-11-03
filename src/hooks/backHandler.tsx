import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';

/**
 * Back-handler stack — the clean replacement for the ref-based prop drilling.
 *
 * Any component with a modal/overlay/sub-tab calls `useBackHandler` to register
 * a close function. When the phone back button is pressed, the stack is popped
 * from top (most recently registered) to bottom. The first handler that
 * returns `true` wins. If no handler returns `true`, the fallback in
 * `useBackTrapping` runs (navigate to parent view, or show logout confirm).
 *
 * Priority is automatic: the most recently OPENED overlay is on top. This
 * matches user expectation — back closes the thing you just opened.
 */

interface BackHandlerContextValue {
  /** Register a back handler. Returns an unregister function. */
  register: (handler: () => boolean) => () => void;
  /** Pop the stack — call the top handler. Returns true if consumed. */
  pop: () => boolean;
}

const BackHandlerContext = createContext<BackHandlerContextValue | null>(null);

interface Entry {
  id: number;
  handler: () => boolean;
}

export function BackHandlerProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<Entry[]>([]);
  const idCounter = useRef(0);

  const register = useCallback((handler: () => boolean) => {
    const id = ++idCounter.current;
    stackRef.current = [...stackRef.current, { id, handler }];
    return () => {
      stackRef.current = stackRef.current.filter((e) => e.id !== id);
    };
  }, []);

  const pop = useCallback(() => {
    const stack = stackRef.current;
    // Call from top (most recently registered) to bottom.
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].handler()) return true;
    }
    return false;
  }, []);

  return (
    <BackHandlerContext.Provider value={{ register, pop }}>
      {children}
    </BackHandlerContext.Provider>
  );
}

/**
 * Register a back handler that is active only when `active` is true.
 *
 * The handler is stored in a ref so the registration doesn't change on every
 * render — only when `active` flips. When `active` becomes false, the handler
 * is automatically unregistered from the stack.
 *
 * Usage:
 *   useBackHandler(() => { setShowModal(false); return true; }, showModal);
 */
export function useBackHandler(handler: () => boolean, active: boolean): void {
  const ctx = useContext(BackHandlerContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active || !ctx) return;
    return ctx.register(() => handlerRef.current());
  }, [active, ctx]);
}

/** Internal — used by useBackTrapping to pop the stack on back press. */
export function useBackHandlerStack(): (() => boolean) | null {
  const ctx = useContext(BackHandlerContext);
  if (!ctx) return null;
  return ctx.pop;
}
