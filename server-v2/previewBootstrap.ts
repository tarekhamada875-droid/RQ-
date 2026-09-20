import type { Express } from 'express';
import { mountV2Preview } from './http/mount.js';
import { createV2PreviewApp } from './preview.js';
import type { V2Environment } from './config/environment.js';

export function mountConfiguredV2Preview(app: Express, environment: V2Environment): boolean {
  if (!environment.V2_PREVIEW_ENABLED || !environment.V2_PREVIEW_AUTH_ENABLED) return false;
  mountV2Preview(app, createV2PreviewApp(environment), true, true);
  return true;
}
