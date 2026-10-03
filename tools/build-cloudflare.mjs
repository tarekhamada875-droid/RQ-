import { build } from 'esbuild';
import path from 'node:path';

const root = process.cwd();
const workerAdapter = path.resolve(root, 'server/firebaseWorkerAdmin.ts');

await build({
  entryPoints: [path.resolve(root, 'server/cloudflareWorker.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  mainFields: ['module', 'main'],
  define: { __dirname: JSON.stringify('.') },
  outfile: path.resolve(root, 'dist/worker.js'),
  plugins: [{
    name: 'worker-firebase-admin-alias',
    setup(buildApi) {
      buildApi.onResolve({ filter: /(^|\/)firebaseAdmin$/ }, () => ({ path: workerAdapter }));
      buildApi.onResolve({ filter: /^firebase-admin\/firestore$/ }, () => ({ path: workerAdapter }));
    }
  }]
});
