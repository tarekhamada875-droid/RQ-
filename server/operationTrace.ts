import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Response } from 'express';
import { adminDb } from './firebaseAdmin';
import type { AuthRequest } from './middleware';

const TRACE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SENSITIVE_PATH_PARTS = /authorization|token|password|pin|secret|key/i;
export interface TraceContext {
  correlationId: string;
  operationId?: string;
}

const traceContextStorage = new AsyncLocalStorage<TraceContext>();

function traceDocumentId(correlationId: string): string {
  return crypto.createHash('sha256').update(correlationId).digest('hex');
}

function safePath(path: string): string {
  return path.split('?')[0].split('/').map((part) => SENSITIVE_PATH_PARTS.test(part) ? '[redacted]' : part).join('/');
}

/**
 * Records one bounded, privacy-safe trace for every API request.
 * Request bodies, authorization headers, IP addresses, plates, and payment data
 * are deliberately excluded. Business records and domain events remain the
 * source of truth for detailed customer data.
 */
export function operationTraceMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const correlationId = req.correlationId || crypto.randomUUID();
  const operationId = typeof req.headers['x-operation-id'] === 'string'
    ? req.headers['x-operation-id'].slice(0, 128)
    : undefined;

  res.on('finish', () => {
    if (!adminDb || !req.path.startsWith('/api/')) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TRACE_RETENTION_MS);
    const trace = {
      schemaVersion: 1,
      correlationId,
      operationId: operationId || null,
      method: req.method,
      path: safePath(req.path),
      statusCode: res.statusCode,
      outcome: res.statusCode >= 500 ? 'server_error' : res.statusCode >= 400 ? 'client_error' : 'success',
      durationMs: Math.max(0, Date.now() - startedAt),
      actorUid: req.user?.uid || null,
      actorRole: req.user?.role || null,
      garageId: req.user?.garageId || null,
      occurredAt: now,
      expiresAt,
    };

    // Fire-and-forget avoids delaying the customer response. The trace is
    // diagnostic evidence, while the transaction/event records are authoritative.
    void adminDb.doc(`operation_traces/${traceDocumentId(correlationId)}`).set(trace).catch((error) => {
      console.error('[OperationTrace] Failed to persist trace', {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  traceContextStorage.run({ correlationId, operationId }, next);
}

export function getTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}

export function operationTraceDocumentId(correlationId: string): string {
  return traceDocumentId(correlationId);
}
