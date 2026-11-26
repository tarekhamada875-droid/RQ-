import { createContext, useContext, type ReactNode } from 'react';
import { useMemo } from 'react';
import { useServerTime } from './useServerTime';

/**
 * Provides server-corrected time to any component that needs it — without
 * prop drilling.
 *
 * The server-time sync (HEAD request + interval) runs exactly once, in the
 * provider.
 *
 * AUDIT F-1 (2026-11-26): the context is split in two so the 60-second tick
 * only reaches the components that genuinely display a running clock
 * (CheckOutModal's elapsed time). Everything else — specifically the
 * vehicle-operations hook whose confirmCheckOut needed the corrected time
 * only at confirm time — consumes the STABLE getNow() function, whose
 * identity never changes, so a tick no longer re-renders the whole active
 * dashboard ~1,440 times per day per device.
 *
 *   NowContext    — the ticking `Date` (subscribes: displays elapsed time)
 *   GetNowContext — stable () => Date (subscribes: nothing; reads at call time)
 */
interface ServerTimeNowValue {
  now: Date;
}

const NowContext = createContext<ServerTimeNowValue | null>(null);
const GetNowContext = createContext<(() => Date) | null>(null);

export function ServerTimeProvider({ children }: { children: ReactNode }) {
  const { now, getNow } = useServerTime();
  const nowValue = useMemo(() => ({ now }), [now]);
  return (
    <GetNowContext.Provider value={getNow}>
      <NowContext.Provider value={nowValue}>
        {children}
      </NowContext.Provider>
    </GetNowContext.Provider>
  );
}

/** Ticking server-corrected time. Re-renders the caller every 60 seconds —
 *  only for components that actually display a running clock. */
export function useServerTimeNow(): Date {
  const ctx = useContext(NowContext);
  if (!ctx) throw new Error('useServerTimeNow must be used within ServerTimeProvider');
  return ctx.now;
}

/** Stable server-corrected clock read: `getNow()` returns the corrected time
 *  at the moment of the call, without subscribing to the 60-second tick.
 *  Use inside event handlers / confirm callbacks, not for display. */
export function useServerTimeGetNow(): () => Date {
  const ctx = useContext(GetNowContext);
  if (!ctx) throw new Error('useServerTimeGetNow must be used within ServerTimeProvider');
  return ctx;
}
