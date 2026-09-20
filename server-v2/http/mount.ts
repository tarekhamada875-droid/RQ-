import type { Express } from 'express';
import { V2_INTERNAL_PREFIX } from './prefix.js';

export function mountV2Preview(app: Express, v2App: Express, enabled: boolean): void {
  if (!enabled) return;
  app.use('/api', v2App);
}

export function v2InternalPath(path: string): string {
  return `${V2_INTERNAL_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
}
