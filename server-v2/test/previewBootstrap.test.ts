import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../config/environment.js';
import { mountConfiguredV2Preview } from '../previewBootstrap.js';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe('Railway v2 preview bootstrap', () => {
  it('does not compose v2 when either preview gate is closed', () => {
    const app = express();
    const environment = parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-preview-test', V2_PREVIEW_ENABLED: 'true' });
    expect(mountConfiguredV2Preview(app, environment)).toBe(false);
  });

  it('mounts authenticated v2 under /api/v2 only when both gates are enabled', async () => {
    const app = express();
    const environment = parseEnvironment({
      NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-preview-test',
      V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true', V2_CORS_ALLOWED_ORIGINS: 'https://preview.example'
    });
    expect(mountConfiguredV2Preview(app, environment)).toBe(true);
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    expect((await fetch(`${baseUrl}/api/v2/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/api/v2/packages`)).status).toBe(401);
  });
});
