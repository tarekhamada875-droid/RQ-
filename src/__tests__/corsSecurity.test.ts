import { describe, expect, it } from 'vitest';
import api from '../../server/api';

async function preflight(origin: string, requestedHeaders = 'authorization,x-session-id') {
  return api.fetch(new Request('https://rq.synthetic/api/health', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': requestedHeaders
    }
  }));
}

describe('Hono Worker CORS security', () => {
  it('allows the production frontend and required authenticated request headers', async () => {
    const response = await preflight('https://rq-acg.pages.dev');
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://rq-acg.pages.dev');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-session-id');
  });

  it('supports the local Vite development origin', async () => {
    const response = await preflight('http://localhost:5173');
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('does not reflect an unapproved third-party origin', async () => {
    const response = await preflight('https://malicious-site.example');
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://malicious-site.example');
  });
});
