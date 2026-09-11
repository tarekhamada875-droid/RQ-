/**
 * The Ark — Vercel Serverless Entrypoint (Phase 1)
 *
 * Exposes the central Express application to Vercel's serverless functions
 * for all `/api/*` routes.
 */
// Keep the extension explicit so Vercel's ESM serverless compiler bundles the
// TypeScript dependency graph instead of emitting an unresolved /server/app
// runtime import.
import { app } from '../server/app.ts';

export default app;
