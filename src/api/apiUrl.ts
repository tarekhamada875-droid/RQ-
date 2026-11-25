/**
 * Backend URL resolution for API endpoints.
 *
 * Moved out of apiClient.ts (audit F-14): getApiUrl's only production caller
 * was apiClient itself, and its only other importers were the URL-contract
 * tests. It is now a real module that both production code and those tests
 * import — no longer a test-only export on the API client.
 */

// Production backend API base URL.
//
// Audit ref: Phase 0 / N6 (consolidated audit, 2026-11-06).
//
// SECURITY NOTE: this default points at a personal Cloudflare Worker
// subdomain (`rq.tarekhamada875.workers.dev`). If that account is suspended,
// sold, or compromised, the entire production fleet stops working or could
// be MITM'd. To migrate to a project-owned domain, set the
// `VITE_BACKEND_API_URL` environment variable at build time (Cloudflare Pages
// → Project → Settings → Environment variables) and rebuild — the variable
// takes precedence over this default. See `getApiUrl()` below.
//
// TODO(operator): pick a project-owned domain (e.g. api.rq.app) and set
// VITE_BACKEND_API_URL to it; remove this fallback once Pages env var is in
// place for all environments.
const DEFAULT_BACKEND_API_URL = 'https://rq.tarekhamada875.workers.dev';

export const getApiUrl = (endpoint: string): string => {
  if (!endpoint.startsWith('/api')) return endpoint;

  if (typeof window !== 'undefined' && window.location) {
    const currentHost = (window.location.hostname || '').toLowerCase();
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
      return endpoint;
    }
  }

  const rawBaseUrl = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_BACKEND_API_URL || '') : '';
  const customBaseUrl = typeof rawBaseUrl === 'string' ? rawBaseUrl.trim().replace(/\/+$/, '') : '';
  if (!customBaseUrl) {
    return `${DEFAULT_BACKEND_API_URL}${endpoint}`;
  }
  return `${customBaseUrl}${endpoint}`;
};
