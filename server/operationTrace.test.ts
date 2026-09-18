import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ writes: [] as Array<{ path: string; value: any }> }));

vi.mock('./firebaseAdmin', () => ({
  adminDb: {
    doc: (path: string) => ({
      path,
      set: async (value: any) => { state.writes.push({ path, value }); },
    }),
  },
}));

import { operationTraceDocumentId, operationTraceMiddleware } from './operationTrace';

function response(statusCode: number) {
  const listeners = new Map<string, () => void>();
  return {
    statusCode,
    on(event: string, listener: () => void) { listeners.set(event, listener); },
    finish() { listeners.get('finish')?.(); },
  } as any;
}

describe('operation trace middleware', () => {
  it('writes one privacy-safe trace with correlation and operation identifiers', async () => {
    state.writes.length = 0;
    const res = response(201);
    const req: any = {
      method: 'POST',
      path: '/api/vehicles/check-in?token=do-not-store',
      correlationId: 'corr-success',
      headers: { 'x-operation-id': 'ui-operation-1' },
      user: { uid: 'user-1', role: 'garage', garageId: 'garage-1' },
    };
    let nextCalled = false;
    operationTraceMiddleware(req, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    res.finish();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].path).toBe(`operation_traces/${operationTraceDocumentId('corr-success')}`);
    expect(state.writes[0].value).toMatchObject({
      correlationId: 'corr-success',
      operationId: 'ui-operation-1',
      path: '/api/vehicles/check-in',
      statusCode: 201,
      outcome: 'success',
      actorUid: 'user-1',
      actorRole: 'garage',
      garageId: 'garage-1',
      schemaVersion: 1,
    });
    expect(JSON.stringify(state.writes[0].value)).not.toContain('do-not-store');
    expect(state.writes[0].value.expiresAt).toBeInstanceOf(Date);
  });

  it('records failed API outcomes without storing request bodies or credentials', async () => {
    state.writes.length = 0;
    const res = response(500);
    const req: any = {
      method: 'POST',
      path: '/api/transactions/approve',
      correlationId: 'corr-failure',
      headers: { 'x-operation-id': 'ui-operation-2', authorization: 'Bearer secret' },
      body: { password: 'secret', amount: 100 },
    };
    operationTraceMiddleware(req, res, () => {});
    res.finish();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.writes[0].value).toMatchObject({
      correlationId: 'corr-failure',
      outcome: 'server_error',
      statusCode: 500,
    });
    expect(state.writes[0].value).not.toHaveProperty('body');
    expect(state.writes[0].value).not.toHaveProperty('headers');
  });
});
