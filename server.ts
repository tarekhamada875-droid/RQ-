import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app } from './server/app';
import { handleNodeApiRequest } from './server/nodeAdapter';

const PORT = Number(process.env.PORT) || 3000;
const useHonoApi = process.env.RQ_API_RUNTIME === 'hono';
const runtimeApp = useHonoApi ? express() : app;

async function startServer() {
  if (useHonoApi) {
    runtimeApp.use((req, res, next) => {
      const pathWithoutQuery = (req.url || '').split('?')[0];
      if (pathWithoutQuery === '/api' || pathWithoutQuery.startsWith('/api/')) {
        void handleNodeApiRequest(req, res);
        return;
      }
      next();
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    runtimeApp.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    runtimeApp.use(express.static(distPath));
    runtimeApp.use((_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  runtimeApp.listen(PORT, '0.0.0.0', () => {
    console.log(`[RQ ${useHonoApi ? 'Hono' : 'Express'} Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

export default runtimeApp;
