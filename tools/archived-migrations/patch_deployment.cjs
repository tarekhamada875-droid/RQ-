const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.VERCEL) {
    console.log('[ARK Express Server] Exported for Vercel Serverless');
  } else {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(\`[ARK Express Server] Running on http://0.0.0.0:\${PORT}\`);
    });
  }
  
  return app;
}

const appPromise = startServer();
export default appPromise;
`;

code = code.replace(
  /if \(process\.env\.NODE_ENV !== 'production'\) \{[\s\S]*?startServer\(\);/m,
  replacement
);

fs.writeFileSync('server.ts', code);
