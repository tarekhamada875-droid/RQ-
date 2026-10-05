import { vi, describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MockFirestore, mockAdminAuth } from './mockFirestore';

const mockDb = new MockFirestore();

vi.mock('../../server/firebaseAdmin', () => ({
  get adminDb() {
    return mockDb;
  },
  adminAuth: mockAdminAuth,
  firebaseConfig: {},
  initializeFirebaseAdmin: () => {}
}));

import { api } from '../../server/api';

describe('CF1 — Cloudflare Worker Deployment Contract', () => {
  it('verifies wrangler.toml exists and declares production and preproduction environments', () => {
    const wranglerPath = resolve(process.cwd(), 'wrangler.toml');
    expect(existsSync(wranglerPath)).toBe(true);

    const content = readFileSync(wranglerPath, 'utf8');
    expect(content).toContain('name = "rq"');
    expect(content).toContain('main = "server/cloudflareWorker.ts"');
    expect(content).toContain('compatibility_flags = ["nodejs_compat", "allow_eval_during_startup"]');
    expect(content).toContain('[env.preproduction]');
    expect(content).toContain('name = "rq-backend-pre"');
    expect(content).toContain('FIREBASE_PROJECT_ID');
    expect(content).toContain('FIREBASE_DATABASE_ID');
  });

  it('serves GET /api/health with operational JSON response from worker', async () => {
    const res = await api.fetch(new Request('http://localhost/api/health', {
      method: 'GET'
    }));

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.runtime).toBe('cloudflare-worker');
    expect(body.timestamp).toBeDefined();
  });

  it('serves GET /api/version with version and environment metadata', async () => {
    const res = await api.fetch(new Request('http://localhost/api/version', {
      method: 'GET'
    }));

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.version).toBe('1.0.0');
    expect(body.runtime).toBe('cloudflare-worker');
    expect(body.status).toBe('operational');
    expect(body.environment).toBeDefined();
  });

  it('applies scoped CORS headers for allowed origins', async () => {
    const res = await api.fetch(new Request('http://localhost/api/version', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://rq-acg.pages.dev',
        'Access-Control-Request-Method': 'GET'
      }
    }));

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://rq-acg.pages.dev');
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
  });
});
