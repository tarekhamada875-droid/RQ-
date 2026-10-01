import { Hono } from 'hono';
import { cors } from 'hono/cors';

const workerApp = new Hono();

// Global CORS Middleware
workerApp.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-app-version', 'x-request-id', 'x-idempotency-key'],
  exposeHeaders: ['x-request-id', 'x-idempotency-key']
}));

// Health check endpoint
workerApp.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    runtime: 'cloudflare-worker',
    timestamp: new Date().toISOString()
  });
});

// App version info
workerApp.get('/api/version', (c) => {
  return c.json({
    version: '1.0.0',
    environment: 'cloudflare-edge',
    status: 'operational'
  });
});

export default {
  fetch: workerApp.fetch
};
