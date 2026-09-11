/**
 * The Ark — Vercel Serverless Entrypoint (Phase 1)
 *
 * Exposes the central Express application to Vercel's serverless functions
 * for all `/api/*` routes.
 */
import { app } from '../server/app';

export default app;
