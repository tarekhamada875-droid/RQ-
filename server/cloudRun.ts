import { app } from './app';
import { firebaseConfig } from './firebaseAdmin';
import { parseEnvironment } from '../server-v2/config/environment.js';
import { mountConfiguredV2Preview } from '../server-v2/previewBootstrap.js';

const port = Number(process.env.PORT) || 8080;
const environment = parseEnvironment({
  ...process.env,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId
});
const previewMounted = mountConfiguredV2Preview(app, environment);

if (environment.V2_PREVIEW_ENABLED && !previewMounted) {
  console.warn('[RQ Cloud Run API] v2 preview remains disabled because V2_PREVIEW_AUTH_ENABLED is false');
}

app.listen(port, '0.0.0.0', () => {
  console.log(`[RQ Cloud Run API] Listening on 0.0.0.0:${port}; v2Preview=${previewMounted}`);
});
