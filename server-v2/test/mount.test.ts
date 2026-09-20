import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import { mountV2Preview, v2InternalPath } from '../http/mount.js';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

async function start(enabled: boolean): Promise<string> {
  const root = express();
  const v2 = createV2App({ environment: parseEnvironment({ NODE_ENV: 'test', V2_PORT: '8081' }) });
  mountV2Preview(root, v2, enabled);
  server = root.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const address = server?.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('v2 external route boundary', () => {
  it('keeps the preview mount disabled by default', async () => {
    const baseUrl = await start(false);
    expect((await fetch(`${baseUrl}/api/v2/health`)).status).toBe(404);
  });

  it('maps external /api/v2 requests to the isolated internal /v2 app', async () => {
    const baseUrl = await start(true);
    const response = await fetch(`${baseUrl}/api/v2/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { status: 'ok' } });
  });

  it('normalizes internal v2 paths without changing the external prefix', () => {
    expect(v2InternalPath('/health')).toBe('/v2/health');
    expect(v2InternalPath('packages')).toBe('/v2/packages');
  });
});
