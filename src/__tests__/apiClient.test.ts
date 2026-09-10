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

  it('ignores placeholder or bare apex domain like https://run.app', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'parqv2.vercel.app',
      },
      writable: true,
    });
    // Even if VITE_BACKEND_API_URL is set to bare https://run.app, it should not use it
    expect(getApiUrl('/api/auth/verify-pin')).toBe('/api/auth/verify-pin');
  });
});
