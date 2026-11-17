import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduled } from './cloudflareWorker';

afterEach(() => {
  vi.unstubAllGlobals();
});

const SELF_URL = 'https://rq.tarekhamada875.workers.dev';

describe('keep-warm scheduled handler', () => {
  it('self-pings /api/version when WORKER_SELF_URL is configured', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();

    await scheduled({}, { WORKER_SELF_URL: SELF_URL }, { waitUntil });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await (waitUntil.mock.calls[0] as unknown as [Promise<void>])[0];
    expect(fetchMock).toHaveBeenCalledWith(`${SELF_URL}/api/version`, {
      headers: { 'x-rq-keep-warm': '1' }
    });
  });

  it('does nothing when WORKER_SELF_URL is missing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();

    await scheduled({}, {}, { waitUntil });

    expect(waitUntil).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows ping failures so cron runs never error', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchMock);
    const waitUntil = vi.fn();

    await scheduled({}, { WORKER_SELF_URL: SELF_URL }, { waitUntil });

    // The waitUntil promise is guarded internally: resolving it must not throw.
    await expect((waitUntil.mock.calls[0] as unknown as [Promise<void>])[0]).resolves.toBeUndefined();
  });
});
