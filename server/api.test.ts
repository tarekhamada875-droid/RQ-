import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { api } from './api';
import { createNodeApiServer } from './nodeAdapter';

let server: ReturnType<typeof createNodeApiServer> | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;
});

describe('canonical Hono API', () => {
  it('serves health through the Fetch contract', async () => {
    const response = await api.request('http://localhost/api/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', runtime: 'cloudflare-worker' });
  });

  it('preserves the version response envelope', async () => {
    const response = await api.request('http://localhost/api/version');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ version: '1.0.0', status: 'operational' });
  });

  it('preserves unauthenticated route protection', async () => {
    const response = await api.request('http://localhost/api/garages');
    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain('Bearer token required');
  });
});

describe('Node Fetch adapter', () => {
  it('serves the canonical app over ordinary Node HTTP', async () => {
    server = createNodeApiServer();
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Adapter did not bind');
    const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: address.port, path: '/api/health', method: 'GET' }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ status: 'ok', runtime: 'cloudflare-worker' });
  });
});
