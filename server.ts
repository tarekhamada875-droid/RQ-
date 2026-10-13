import { createServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { handleNodeApiRequest } from './server/nodeAdapter';

const port = Number(process.env.PORT) || 3000;

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
      void handleNodeApiRequest(request, response);
      return;
    }

    vite.middlewares(request, response, (error) => {
      if (error) {
        console.error('[RQ Vite dev server] Request failed:', error);
        if (!response.headersSent) response.statusCode = 500;
        if (!response.writableEnded) response.end('Internal Server Error');
        return;
      }
      if (!response.writableEnded) {
        response.statusCode = 404;
        response.end('Not Found');
      }
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[RQ Hono/Vite dev server] Running on http://0.0.0.0:${port}`);
  });
}

void startServer().catch((error) => {
  console.error('[RQ Hono/Vite dev server] Failed to start:', error);
  process.exitCode = 1;
});
