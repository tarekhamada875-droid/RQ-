/**
 * Canonical Fetch-native API application.
 *
 * The current Worker implementation already contains the production Hono
 * route graph. This module gives local adapters and tests a stable import
 * point without copying or renaming any route.
 */
import { workerApp } from './cloudflareWorker';

export const api = workerApp;
export type ApiApp = typeof api;
export default api;
