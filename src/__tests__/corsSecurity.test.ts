import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAllowedOrigin } from '../../server/app';

describe('CORS Origin Validation', () => {
  const originalEnv = process.env.ALLOWED_ORIGINS;

  beforeEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOWED_ORIGINS = originalEnv;
    } else {
      delete process.env.ALLOWED_ORIGINS;
    }
  });

  it('allows requests with no origin (same-origin, mobile apps, curl)', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('')).toBe(true);
  });

  it('allows production Vercel frontends and rejects unlisted preview/spoofed subdomains', () => {
    // Exact production frontends
    expect(isAllowedOrigin('https://parqv2.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://parqv2.vercel.app/')).toBe(true);
    expect(isAllowedOrigin('https://parq1.vercel.app')).toBe(true);

    // Unlisted preview domains are rejected until explicitly added to ALLOWED_ORIGINS
    expect(isAllowedOrigin('https://parqv2-preview-123.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://parqv2-git-main-yourteam.vercel.app')).toBe(false);

    // Spoofed/malicious naming patterns on vercel.app must be rejected
    expect(isAllowedOrigin('https://parq-fake.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://parq1-evil.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://parqv2-anything.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://some-random-app.vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://evil-attacker.vercel.app')).toBe(false);
  });

  it('allows canonical backend APP_URL and paired preview domain but rejects arbitrary Cloud Run origins', () => {
    const originalAppUrl = process.env.APP_URL;
    process.env.APP_URL = 'https://ais-dev-tvpplsstum3g4ltmsfbc4w-580506195065.europe-west2.run.app';
    
    // Canonical hosting URL is allowed
    expect(isAllowedOrigin('https://ais-dev-tvpplsstum3g4ltmsfbc4w-580506195065.europe-west2.run.app')).toBe(true);
    // Paired AI Studio preview domain is allowed
    expect(isAllowedOrigin('https://ais-pre-tvpplsstum3g4ltmsfbc4w-580506195065.europe-west2.run.app')).toBe(true);
    
    // Arbitrary unrelated Cloud Run origins must be rejected
    expect(isAllowedOrigin('https://some-other-service-xyz.a.run.app')).toBe(false);
    expect(isAllowedOrigin('https://my-app.run.app')).toBe(false);

    if (originalAppUrl !== undefined) {
      process.env.APP_URL = originalAppUrl;
    } else {
      delete process.env.APP_URL;
    }
  });

  it('allows Google AI Studio and rejects arbitrary Google-hosted subdomains', () => {
    expect(isAllowedOrigin('https://aistudio.google.com')).toBe(true);
    expect(isAllowedOrigin('https://attacker.googleusercontent.com')).toBe(false);
    expect(isAllowedOrigin('https://preview.usercontent.goog')).toBe(false);
  });

  it('allows localhost and loopback interfaces on any port in development', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://localhost:8080')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('allows custom origins specified in ALLOWED_ORIGINS env variable', () => {
    process.env.ALLOWED_ORIGINS = 'https://custom-garage.com, https://admin.custom.org';
    expect(isAllowedOrigin('https://custom-garage.com')).toBe(true);
    expect(isAllowedOrigin('https://admin.custom.org')).toBe(true);
    expect(isAllowedOrigin('https://other-unauthorized.com')).toBe(false);
  });

  it('denies unknown/unauthorized third-party origins', () => {
    expect(isAllowedOrigin('https://malicious-site.com')).toBe(false);
    expect(isAllowedOrigin('https://attacker.org')).toBe(false);
    expect(isAllowedOrigin('https://notrun.app.evil.com')).toBe(false);
  });

  it('handles malformed origin strings safely without throwing', () => {
    expect(isAllowedOrigin('not-a-valid-url')).toBe(false);
    expect(isAllowedOrigin('://invalid')).toBe(false);
  });
});
