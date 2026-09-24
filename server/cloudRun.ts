import { createApp } from './app';
import { firebaseConfig } from './firebaseAdmin';
import { parseEnvironment } from '../server-v2/config/environment.js';
import { configuredV2Preview } from '../server-v2/previewBootstrap.js';

const port = Number(process.env.PORT) || 8080;
const environment = parseEnvironment({
  ...process.env,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId
});
const previewApp = configuredV2Preview(environment);
const previewMounted = Boolean(previewApp);
const app = createApp(previewApp ? { apiPreviewApp: previewApp } : {});

if (environment.V2_PREVIEW_ENABLED && !previewMounted) {
  console.warn('[RQ Cloud Run API] v2 preview remains disabled because its production safety requirements are not satisfied');
}

app.listen(port, '0.0.0.0', () => {
  console.log(`[RQ Cloud Run API] Listening on 0.0.0.0:${port}; v2Preview=${previewMounted}`);
});
