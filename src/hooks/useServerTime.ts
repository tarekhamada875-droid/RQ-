import { useState, useEffect, useCallback, useRef } from 'react';

export function useServerTime() {
  const [serverTimeOffset, setServerTimeOffset] = useState(0); // ms difference (server - local)
  const [now, setNow] = useState(new Date());
  const offsetRef = useRef(0);

  // Keep ref in sync with state in order to use inside stable callbacks
  useEffect(() => {
    offsetRef.current = serverTimeOffset;
  }, [serverTimeOffset]);

  const fetchServerTimeOffset = useCallback(async () => {
    try {
      const start = Date.now();
      // Lightweight HEAD request to fetch only HTTP headers (0-byte payload), saving bandwidth and CPU
      let res: Response;
      try {
        res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
      } catch {
        res = await fetch('/', { method: 'GET', cache: 'no-store' });
      }
      const dateHeader = res.headers.get('date');
      if (dateHeader) {
        const serverTime = new Date(dateHeader).getTime();
        if (!isNaN(serverTime) && serverTime > 0) {
          const rtt = Date.now() - start;
          const correctedServerTime = serverTime + (rtt / 2);
          const offset = correctedServerTime - Date.now();
          if (!isNaN(offset)) {
            setServerTimeOffset(offset);
            return offset;
          }
        }
      }
    } catch {
      // Fallback to local lock if server time offset fetch fails
    }
    return offsetRef.current;
  }, []); // Stable callback, empty dependencies!

  useEffect(() => {
    fetchServerTimeOffset();
    // Clock drift on modern devices is <1s/hour, so syncing every 6 hours is
    // more than sufficient. Also resync when the tab regains visibility (covers
    // long sleep/wake cycles). This cuts Worker requests from 288/day to ~10/day
    // per active client.
    const interval = setInterval(fetchServerTimeOffset, 6 * 60 * 60 * 1000);
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchServerTimeOffset();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [fetchServerTimeOffset]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date(Date.now() + serverTimeOffset));
    }, 60000); // Throttled to 60s to minimize re-renders and CPU usage
    return () => clearInterval(timer);
  }, [serverTimeOffset]);

  return { now, serverTimeOffset, setServerTimeOffset, fetchServerTimeOffset };
}
