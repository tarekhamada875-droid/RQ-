import express, { type Express } from 'express';
import cors from 'cors';
import {
  correlationMiddleware,
  requestTimeoutMiddleware
} from './middleware';
import { operationTraceMiddleware } from './operationTrace';

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;

  const normalizedOrigin = origin.replace(/\/+$/, '');

  // Preview deployments must be added explicitly through ALLOWED_ORIGINS.
  if (process.env.ALLOWED_ORIGINS) {
    const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
    if (customOrigins.includes(normalizedOrigin)) return true;
  }

  // The backend trusts its own canonical URL (injected by the hosting platform)
  // and paired dev/preview domains for this specific service instance.
  if (process.env.APP_URL) {
    const canonicalAppUrl = process.env.APP_URL.replace(/\/+$/, '');
    if (normalizedOrigin === canonicalAppUrl) return true;

    const pairedAppUrl = canonicalAppUrl.includes('ais-dev-')
      ? canonicalAppUrl.replace('ais-dev-', 'ais-pre-')
      : canonicalAppUrl.includes('ais-pre-')
        ? canonicalAppUrl.replace('ais-pre-', 'ais-dev-')
        : '';
    if (pairedAppUrl && normalizedOrigin === pairedAppUrl) return true;
  }

  const exactOrigins = new Set([
    'https://aistudio.google.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ]);

  if (exactOrigins.has(normalizedOrigin)) return true;

  try {
    const parsed = new URL(normalizedOrigin);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
    if (
      hostname === 'parqv2.pages.dev' ||
      hostname === 'parq1.pages.dev' ||
      hostname === 'rq-acg.pages.dev' ||
      ((hostname.startsWith('ais-dev-') || hostname.startsWith('ais-pre-')) && hostname.endsWith('.run.app'))
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function createApp(options: Readonly<{ apiPreviewApp?: Express }> = {}) {
  const app = express();
  app.set('trust proxy', 1);

  // Dynamic Multi-Tenant CORS policy
  app.use(cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Backend-Operator-Token',
      'X-Session-ID',
      'X-Correlation-ID',
      'X-Operation-ID',
      'Idempotency-Key'
    ]
  }));

  app.use(express.json());
  app.use(correlationMiddleware);
  app.use(requestTimeoutMiddleware(15000));
  app.use(operationTraceMiddleware);

  if (options.apiPreviewApp) app.use('/api', options.apiPreviewApp);

  // Vite development middleware vs Static Production serving
  
  // API 404 handler

  // API 404 handler
  app.use('/api', (_req: express.Request, res: express.Response) => {
    res.status(404).json({ success: false, error: 'API route not found' });
  });

  // Global error handler to prevent HTML stack traces
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Express Global Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'INTERNAL_SERVER_ERROR' });
  });

  return app;
}

export const app = createApp();
