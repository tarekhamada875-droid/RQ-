/**
 * useGlobalCreditRate — fetches system_config/global.creditRate once and
 * returns it in the DISPLAY unit (EGP-per-credit), or null while loading /
 * on failure (callers fall back to their own handling).
 *
 * Shared by the admin credit-grant panel and the per-garage pricing section
 * so both speak the same "effective price" language without duplicating the
 * fetch. One small admin-only GET per mount — no listeners, no polling.
 */
import { useEffect, useState } from 'react';
import { apiFetch } from '../api/apiClient';
import { rateToEgpPerCredit } from '../utils/creditRate';

export function useGlobalCreditRate(): number | null {
  const [egpPerCredit, setEgpPerCredit] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // cacheTtlMs (perf plan 2026-11-21): the server edge-caches this
        // endpoint (version-keyed, auto-invalidated on save), so re-mounts
        // answer instantly from the client SWR memory cache instead of
        // paying a Worker round trip per mount. Server freshness is governed
        // by the version board — this client TTL only limits repeat trips.
        const data = await apiFetch<{ success?: boolean; config?: { creditRate?: number } }>('/api/system-config', { cacheTtlMs: 300_000 });
        if (!cancelled && data?.success && data.config) {
          setEgpPerCredit(rateToEgpPerCredit(data.config.creditRate));
        } else if (!cancelled) {
          setEgpPerCredit(1);
        }
      } catch {
        if (!cancelled) setEgpPerCredit(1);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return egpPerCredit;
}
