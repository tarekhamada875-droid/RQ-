import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createApp } from './app';
import { Readable, Writable } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';

const workerApp = new Hono();
const expressApp = createApp();

// Global CORS Middleware for Hono
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

// Helper function to adapt Fetch API Request/Response to Express (req, res)
async function handleExpressRequest(request: Request): Promise<Response> {
  return new Promise<Response>(async (resolve, reject) => {
    try {
      const url = new URL(request.url);
      const reqBodyBuffer = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);

      // Create a Readable stream mock for IncomingMessage
      const reqStream = new Readable();
      reqStream.push(reqBodyBuffer);
      reqStream.push(null);

      const req = Object.assign(reqStream, {
        url: url.pathname + url.search,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        httpVersion: '1.1',
        httpVersionMajor: 1,
        httpVersionMinor: 1,
        connection: { remoteAddress: request.headers.get('cf-connecting-ip') || '127.0.0.1' },
        socket: { remoteAddress: request.headers.get('cf-connecting-ip') || '127.0.0.1' }
      }) as unknown as IncomingMessage;

      const resHeaders: Record<string, string | string[]> = {};
      let statusCode = 200;
      let statusMessage = 'OK';
      const chunks: Buffer[] = [];

      // Create a Writable stream mock for ServerResponse
      const resStream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
          callback();
        }
      });

      const res = Object.assign(resStream, {
        statusCode: 200,
        statusMessage: 'OK',
        headersSent: false,
        setHeader(name: string, value: string | string[]) {
          resHeaders[name.toLowerCase()] = value;
          return this;
        },
        getHeader(name: string) {
          return resHeaders[name.toLowerCase()];
        },
        removeHeader(name: string) {
          delete resHeaders[name.toLowerCase()];
          return this;
        },
        writeHead(code: number, messageOrHeaders?: string | Record<string, string | string[]>, headers?: Record<string, string | string[]>) {
          statusCode = code;
          if (typeof messageOrHeaders === 'string') {
            statusMessage = messageOrHeaders;
            if (headers) {
              for (const [k, v] of Object.entries(headers)) {
                resHeaders[k.toLowerCase()] = v;
              }
            }
          } else if (messageOrHeaders) {
            for (const [k, v] of Object.entries(messageOrHeaders)) {
              resHeaders[k.toLowerCase()] = v;
            }
          }
          this.headersSent = true;
          return this;
        },
        end(chunk?: any, encoding?: any, callback?: any) {
          if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
          }
          Writable.prototype.end.call(this, callback);

          const finalBody = Buffer.concat(chunks);
          const responseHeaders = new Headers();

          for (const [key, val] of Object.entries(resHeaders)) {
            if (Array.isArray(val)) {
              for (const v of val) responseHeaders.append(key, v);
            } else if (val !== undefined) {
              responseHeaders.set(key, String(val));
            }
          }

          resolve(new Response(finalBody, {
            status: statusCode,
            statusText: statusMessage,
            headers: responseHeaders
          }));
        }
      }) as unknown as ServerResponse;

      // Execute Express routing pipeline
      expressApp(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

// Route all API requests to the full Express application engine
workerApp.all('/api/*', async (c) => {
  return handleExpressRequest(c.req.raw);
});

export default {
  fetch: workerApp.fetch
};
