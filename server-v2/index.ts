import { createV2App } from './app.js';
import { parseEnvironment } from './config/environment.js';

const environment = parseEnvironment(process.env);
const app = createV2App({ environment });
const server = app.listen(environment.V2_PORT, '0.0.0.0', () => {
  console.log(`server-v2 listening on ${environment.V2_PORT}`);
});

function shutdown(signal: string): void {
  console.log(`server-v2 received ${signal}`);
  server.close(() => process.exit(0));
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
