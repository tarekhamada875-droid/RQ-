import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { currentUser: null } }));

import { ApiError, apiFetch, getApiUrl } from './apiClient';

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
  });

  it('uses the Railway fallback for deployed API endpoints and preserves external URLs', () => {
    vi.stubGlobal('window', { location: { hostname: 'rq-acg.pages.dev' } });
    expect(getApiUrl('/api/health')).toBe('https://rq-production-af02.up.railway.app/api/health');
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
});
