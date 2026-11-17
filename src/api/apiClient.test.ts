import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { currentUser: null } }));

import { ApiError, apiFetch, __resetInFlightGetsForTests, getApiUrl } from './apiClient';
import { auth } from '../firebase';

function response(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType, 'X-Correlation-ID': 'server-correlation' },
  });
}

describe('frontend API boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    __resetInFlightGetsForTests();
  });

  afterEach(() => {
    (auth as { currentUser: unknown }).currentUser = null;
  });

  it('uses the Cloudflare Worker fallback for deployed API endpoints and preserves external URLs', () => {
    vi.stubGlobal('window', { location: { hostname: 'rq-acg.pages.dev' } });
    expect(getApiUrl('/api/health')).toBe('https://rq.tarekhamada875.workers.dev/api/health');
    expect(getApiUrl('https://example.test/data')).toBe('https://example.test/data');
    vi.unstubAllGlobals();
  });

  it('strips client identity fields while preserving business inputs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ success: true }));
    await apiFetch('/api/vehicles/check-in', {
      method: 'POST',
      body: { garageId: 'garage_1', plateNumber: 'ABC 123', uid: 'spoofed', role: 'admin', firebaseIdToken: 'spoofed' },
    });
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ garageId: 'garage_1', plateNumber: 'ABC 123' });
    expect((request.headers as Record<string, string>)['X-Correlation-ID']).toBeTruthy();
    expect((request.headers as Record<string, string>)['X-Operation-ID']).toMatch(/^ui_/);
  });

  it('raises a structured ApiError for business failures without expiring the session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ success: false, code: 'GARAGE_CHECK_IN_LOCKED', error: 'GARAGE_CHECK_IN_LOCKED' }, 409));
    const expiryListener = vi.fn();
    window.addEventListener('api-session-expired', expiryListener);
    await expect(apiFetch('/api/vehicles/check-in', { method: 'POST', body: { garageId: 'garage_1', plateNumber: 'ABC 123' } })).rejects.toMatchObject({
      name: 'ApiError', code: 'GARAGE_CHECK_IN_LOCKED', status: 409, correlationId: 'server-correlation',
    });
    expect(expiryListener).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    window.removeEventListener('api-session-expired', expiryListener);
  });

  it('raises a structured session error and dispatches one expiry event for unauthorized responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ success: false, code: 'SESSION_EXPIRED', error: 'SESSION_EXPIRED' }, 401));
    const expiryListener = vi.fn();
    window.addEventListener('api-session-expired', expiryListener);
    const promise = apiFetch('/api/auth/validate-or-refresh-session');
    await expect(promise).rejects.toMatchObject({ name: 'ApiError', code: 'SESSION_EXPIRED', status: 401 });
    expect(expiryListener).toHaveBeenCalledOnce();
    expect((expiryListener.mock.calls[0][0] as CustomEvent).detail.correlationId).toBe('server-correlation');
    window.removeEventListener('api-session-expired', expiryListener);
  });

  it('fails predictably on network errors and request timeouts', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    await expect(apiFetch('/api/health')).rejects.toMatchObject({ name: 'ApiError', code: 'NETWORK_ERROR' });

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    await expect(apiFetch('/api/health', { timeoutMs: 1 })).rejects.toMatchObject({ name: 'ApiError', code: 'API_TIMEOUT' });
  });

  it('converts HTML and malformed JSON responses into typed invalid-response errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>failure</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    await expect(apiFetch('/api/health')).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_RESPONSE', status: 502 });

    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(apiFetch('/api/health')).rejects.toMatchObject({ name: 'ApiError', code: 'INVALID_RESPONSE', status: 200 });
  });

  it('exposes ApiError as an Error for existing UI catch blocks', () => {
    const error = new ApiError('failure', { code: 'TEST', status: 400 });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('failure');
  });

  it('shares a single in-flight token fetch across concurrent requests (single-flight)', async () => {
    // DevTools runtime audit 2026-11-11: concurrent requests each awaited
    // getIdToken() independently, overlapping refresh work near expiry.
    let tokenFetches = 0;
    const authUser = {
      uid: 'user-1',
      getIdToken: vi.fn(() => new Promise<string>((resolve) => {
        tokenFetches += 1;
        setTimeout(() => resolve('shared-token'), 10);
      })),
    };
    (auth as { currentUser: unknown }).currentUser = authUser;
    // Fresh Response per call: a Response body can only be read once.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response({ success: true })));

    await Promise.all([
      apiFetch('/api/health'),
      apiFetch('/api/health'),
      apiFetch('/api/health'),
    ]);

    expect(tokenFetches).toBe(1);
    expect(authUser.getIdToken).toHaveBeenCalledTimes(1);
    for (const call of fetchMock.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer shared-token');
    }

    // No blind TTL cache: after the fetch settles, the next request fetches
    // again (the Firebase SDK then serves its own cached token).
    await apiFetch('/api/health');
    expect(tokenFetches).toBe(2);
  });

  it('shares one in-flight GET across identical concurrent callers (single-flight, perf audit F2)', async () => {
    // Owner debug audit 2026-11-17: the first admin load fired the same list
    // GETs twice 3-4ms apart — two round trips for one answer. The second and
    // third concurrent caller must now ride the first request.
    let fetches = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
      fetches += 1;
      setTimeout(() => resolve(response({ success: true, garages: [{ id: 'g1' }], hasMore: false, nextCursor: null })), 20);
    }));

    const [a, b, c] = await Promise.all([
      apiFetch('/api/garages?limit=50'),
      apiFetch('/api/garages?limit=50'),
      apiFetch('/api/garages?limit=50'),
    ]);

    expect(fetches).toBe(1);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Not a cache: once settled, the next call goes to the network again.
    await apiFetch('/api/garages?limit=50');
    expect(fetches).toBe(2);

    // Different endpoints never share.
    await apiFetch('/api/garages?limit=20');
    expect(fetches).toBe(3);

    // POSTs never share, even to the same URL.
    await Promise.all([
      apiFetch('/api/garages?limit=50', { method: 'POST', body: { id: 'g1' } }),
      apiFetch('/api/garages?limit=50', { method: 'POST', body: { id: 'g1' } }),
    ]);
    expect(fetches).toBe(5);
  });

  it('serves cacheTtlMs GETs instantly and revalidates in the background (SWR, perf audit F7)', async () => {
    // Owner debug audit 2026-11-17: every tab return re-downloaded the same
    // bootstrap reads (~1-1.5s each). Within the TTL the cached value must
    // answer immediately while a background revalidation refreshes the copy.
    let current = 1_000_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => current);
    let fetches = 0;
    let payload = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
      fetches += 1;
      const value = payload;
      setTimeout(() => resolve(response({ success: true, config: { creditRate: value } })), 5);
    }));

    try {
      const first = await apiFetch('/api/system-config', { cacheTtlMs: 60_000 });
      expect(fetches).toBe(1);

      // 6s later: still inside the 60s TTL and past the 5s revalidation gap
      // → instant cached answer + a background refresh kicks off.
      current += 6_000;
      payload = 1;
      const second = await apiFetch('/api/system-config', { cacheTtlMs: 60_000 });
      expect(second).toEqual(first); // served instantly from cache
      expect(fetches).toBe(2); // background revalidation started
      await new Promise((resolve) => setTimeout(resolve, 30)); // let revalidation land
      expect(fetches).toBe(2);

      // The next caller sees the refreshed value with no extra fetch.
      const third = await apiFetch('/api/system-config', { cacheTtlMs: 60_000 });
      expect(third).toEqual({ success: true, config: { creditRate: 1 } });
      expect(fetches).toBe(2);

      // Beyond the TTL → blocking network fetch again.
      current += 61_000;
      payload = 2;
      const fourth = await apiFetch('/api/system-config', { cacheTtlMs: 60_000 });
      expect(fourth).toEqual({ success: true, config: { creditRate: 2 } });
      expect(fetches).toBe(3);
    } finally {
      clock.mockRestore();
    }
  });

  it('drops cached reads after a business mutation but not after auth calls (perf audit F7)', async () => {
    let current = 1_000_000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => current);
    let fetches = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
      fetches += 1;
      setTimeout(() => resolve(response({ success: true })), 5);
    }));

    try {
      await apiFetch('/api/garages?limit=50', { cacheTtlMs: 60_000 });
      expect(fetches).toBe(1);

      // Auth traffic must not invalidate (it fires on every heartbeat).
      // fetches: 1 = GET, 2 = the auth POST itself, 3 = bg revalidation.
      current += 6_000;
      await apiFetch('/api/auth/validate-or-refresh-session', { method: 'POST', body: { uid: 'u1' } });
      current += 1_000;
      await apiFetch('/api/garages?limit=50', { cacheTtlMs: 60_000 });
      expect(fetches).toBe(3); // served from cache; only the auth POST + bg revalidation fetched

      // A business mutation invalidates → next read goes to the network.
      current += 6_000;
      await apiFetch('/api/garages/update', { method: 'POST', body: { id: 'g1', isLocked: true } });
      current += 1_000;
      await apiFetch('/api/garages?limit=50', { cacheTtlMs: 60_000 });
      expect(fetches).toBe(5); // 4 = mutation POST, 5 = uncached GET
    } finally {
      clock.mockRestore();
    }
  });

  it('does not share an in-flight GET across different signed-in users', async () => {
    const authUser = { uid: 'user-1', getIdToken: vi.fn().mockResolvedValue('token-user-1') };
    (auth as { currentUser: unknown }).currentUser = authUser;
    let fetches = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
      fetches += 1;
      setTimeout(() => resolve(response({ success: true })), 20);
    }));

    const first = apiFetch('/api/garages?limit=50');
    (auth as { currentUser: unknown }).currentUser = { uid: 'user-2', getIdToken: vi.fn().mockResolvedValue('token-user-2') };
    const second = apiFetch('/api/garages?limit=50');
    await Promise.all([first, second]);

    // Two different users on the same endpoint must never ride each other's
    // response — role-scoped data could differ.
    expect(fetches).toBe(2);
  });

  it('does not share an in-flight token fetch across different users', async () => {
    let resolveFirst!: (token: string) => void;
    const getIdTokenFirst = vi.fn(() => new Promise<string>((resolve) => { resolveFirst = resolve; }));
    (auth as { currentUser: unknown }).currentUser = { uid: 'user-1', getIdToken: getIdTokenFirst };
    // Fresh Response per call: a Response body can only be read once.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(response({ success: true })));

    const first = apiFetch('/api/health');

    // Swap the signed-in user while the first token fetch is still pending:
    // the second request must not inherit the first user's token.
    const getIdTokenSecond = vi.fn().mockResolvedValue('token-user-2');
    (auth as { currentUser: unknown }).currentUser = { uid: 'user-2', getIdToken: getIdTokenSecond };
    const second = apiFetch('/api/health');

    resolveFirst('token-user-1');
    await Promise.all([first, second]);

    expect(getIdTokenFirst).toHaveBeenCalledTimes(1);
    expect(getIdTokenSecond).toHaveBeenCalledTimes(1);
    const authHeaders = fetchMock.mock.calls.map(
      (call) => ((call[1] as RequestInit).headers as Record<string, string>).Authorization
    );
    expect(authHeaders).toContain('Bearer token-user-1');
    expect(authHeaders).toContain('Bearer token-user-2');
  });
});
