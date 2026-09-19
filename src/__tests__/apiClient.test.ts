import { describe, it, expect, afterEach } from 'vitest';
import { getApiUrl } from '../api/apiClient';

describe('apiClient getApiUrl resolution', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('keeps non-api endpoints untouched', () => {
    expect(getApiUrl('/static/image.png')).toBe('/static/image.png');
  });

  it('returns relative path when running on Cloud Run (.run.app)', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'ais-pre-tvpplsstum3g4ltmsfbc4w-580506195065.europe-west2.run.app',
      },
      writable: true,
    });
    expect(getApiUrl('/api/auth/verify-pin')).toBe('/api/auth/verify-pin');
  });

  it('returns relative path when running on localhost', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'localhost',
      },
      writable: true,
    });
    expect(getApiUrl('/api/auth/verify-pin')).toBe('/api/auth/verify-pin');
  });

  it('falls back to the Railway API when the configured base is unusable', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'rq-production-af02.up.railway.app',
      },
      writable: true,
    });
    // In the static Pages deployment, relative /api URLs are SPA fallbacks,
    // so use the known Vercel backend when no valid base URL is configured.
    expect(getApiUrl('/api/auth/verify-pin')).toBe('https://rq-production-af02.up.railway.app/api/auth/verify-pin');
  });
});
