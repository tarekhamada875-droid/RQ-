import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createV2App } from '../app.js';
import { parseEnvironment } from '../config/environment.js';
import { InMemoryGarageDeletionRepository, type GarageDeletionRepository } from '../repositories/firestoreGarageDeletion.js';
import type { DeletionAdvanceInput, DeletionResult, DeletionResumeInput, DeletionStartInput } from '../contracts/deletion.js';

let server: Server | undefined;
afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

function start(role: 'admin' | 'garage' = 'admin'): Promise<{ baseUrl: string; repository: GarageDeletionRepository }> {
  const repository = new InMemoryGarageDeletionRepository(new Set(['garage-1']));
  const app = createV2App({
    environment: parseEnvironment({ NODE_ENV: 'test', V2_PREVIEW_ENABLED: 'true', V2_PREVIEW_AUTH_ENABLED: 'true' }),
    garageDeletion: repository,
    authMiddleware: (request, _response, next) => {
      request.v2Authorization = {
        uid: 'actor-1', sessionId: 'session-1', role,
        ...(role === 'garage' ? { garageId: 'garage-1' } : {}),
        delegateGarageIds: []
      };
      next();
    }
  });
  server = app.listen(0);
  return new Promise((resolve) => server?.once('listening', () => {
    const address = server?.address() as AddressInfo;
    resolve({ baseUrl: `http://127.0.0.1:${address.port}`, repository });
  }));
}

describe('v2 garage deletion routes', () => {
  it('allows admin start, bounded advance, repair, and explicit resume', async () => {
    const { baseUrl } = await start();
    const startResponse = await fetch(`${baseUrl}/v2/garages/garage-1/deletion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'delete-start-01' }) });
    expect(startResponse.status).toBe(201);
    const started = await startResponse.json() as { data: DeletionResult };
    const jobId = started.data.job.id;
    const repairResponse = await fetch(`${baseUrl}/v2/garages/garage-1/deletion/${jobId}/advance`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'delete-page-01', deletedCount: 3, repairNeeded: true, error: 'repair me' }) });
    expect(repairResponse.status).toBe(200);
    expect((await repairResponse.json()).data.job.phase).toBe('repair_needed');
    const resumeResponse = await fetch(`${baseUrl}/v2/garages/garage-1/deletion/${jobId}/resume`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'delete-resume-01' }) });
    expect(resumeResponse.status).toBe(200);
    expect((await resumeResponse.json()).data.job.phase).toBe('deleting');
  });

  it('rejects malformed input and non-admin cross-target callers before repository execution', async () => {
    const malformed = await start();
    const bad = await fetch(`${malformed.baseUrl}/v2/garages/garage-1/deletion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'short' }) });
    expect(bad.status).toBe(400);
    const denied = await start('garage');
    const response = await fetch(`${denied.baseUrl}/v2/garages/garage-2/deletion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'delete-start-02' }) });
    expect(response.status).toBe(403);
  });

  it('does not expose deletion routes when production preview flags are closed', async () => {
    const repository: GarageDeletionRepository = {
      start: async (_input: DeletionStartInput) => ({ job: { id: 'job-1', garageId: 'garage-1', phase: 'queued', deletedCount: 0, updatedAt: '2026-09-22T00:00:00.000Z' } }),
      advance: async (_input: DeletionAdvanceInput) => ({ job: { id: 'job-1', garageId: 'garage-1', phase: 'completed', deletedCount: 0, updatedAt: '2026-09-22T00:00:00.000Z' } }),
      resume: async (_input: DeletionResumeInput) => ({ job: { id: 'job-1', garageId: 'garage-1', phase: 'deleting', deletedCount: 0, updatedAt: '2026-09-22T00:00:00.000Z' } })
    };
    const app = createV2App({ environment: parseEnvironment({ NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'rq-v2-production-test' }), garageDeletion: repository });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const address = server?.address() as AddressInfo;
    expect((await fetch(`http://127.0.0.1:${address.port}/v2/garages/garage-1/deletion`, { method: 'POST' })).status).toBe(404);
  });
});
