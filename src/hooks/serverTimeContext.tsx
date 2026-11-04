import { createContext, useContext, type ReactNode } from 'react';
import { useServerTime } from './useServerTime';

/**
 * Provides `now: Date` (server-corrected, ticking every 60s) to any
 * component that needs it — without prop drilling.
 *
 * The server-time sync (HEAD request + interval) runs exactly once,
 * in the provider.
 */

interface ServerTimeContextValue {
  now: Date;
}

const ServerTimeContext = createContext<ServerTimeContextValue | null>(null);

export function ServerTimeProvider({ children }: { children: ReactNode }) {
  const { now } = useServerTime();
  return (
    <ServerTimeContext.Provider value={{ now }}>
      {children}
    </ServerTimeContext.Provider>
  );
}

export function useServerTimeNow(): Date {
  const ctx = useContext(ServerTimeContext);
  if (!ctx) throw new Error('useServerTimeNow must be used within ServerTimeProvider');
  return ctx.now;
}
