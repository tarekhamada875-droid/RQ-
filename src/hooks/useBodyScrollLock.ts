import { useEffect } from 'react';

interface BodyLockSession {
  readonly activeTokens: Set<symbol>;
  readonly previousOverflow: string;
}

const bodyLockSessions = new WeakMap<HTMLElement, BodyLockSession>();

export const acquireBodyScrollLock = (): (() => void) => {
  if (typeof document === 'undefined' || !document.body) return () => {};

  const body = document.body;
  let session = bodyLockSessions.get(body);
  if (!session) {
    session = {
      activeTokens: new Set<symbol>(),
      previousOverflow: body.style.overflow,
    };
    bodyLockSessions.set(body, session);
  }

  const lockToken = Symbol('body-scroll-lock');
  session.activeTokens.add(lockToken);
  body.style.overflow = 'hidden';

  let released = false;
  return () => {
    if (released) return;
    released = true;
    session.activeTokens.delete(lockToken);

    if (session.activeTokens.size === 0) {
      if (typeof document !== 'undefined' && document.body === body && body.isConnected) {
        body.style.overflow = session.previousOverflow;
      }
      bodyLockSessions.delete(body);
    }
  };
};

export const useBodyScrollLock = (enabled = true): void => {
  useEffect(() => {
    if (!enabled) return;
    return acquireBodyScrollLock();
  }, [enabled]);
};
