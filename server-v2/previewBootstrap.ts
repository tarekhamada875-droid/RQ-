import type { Express } from 'express';
import { mountV2Preview } from './http/mount.js';
import { createV2PreviewApp } from './preview.js';
import type { V2Environment } from './config/environment.js';

export function configuredV2Preview(environment: V2Environment): Express | undefined {
  if (!environment.V2_PREVIEW_ENABLED || !environment.V2_PREVIEW_AUTH_ENABLED) return undefined;
  return createV2PreviewApp(environment);
}

export function mountConfiguredV2Preview(app: Express, environment: V2Environment): boolean {
  const previewApp = configuredV2Preview(environment);
  if (!previewApp) return false;
  mountV2Preview(app, previewApp, true, true);
  return true;
}
