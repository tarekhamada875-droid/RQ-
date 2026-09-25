import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Response } from 'express';
import { adminDb } from './firebaseAdmin';
import type { AuthRequest } from './middleware';

const TRACE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SENSITIVE_PATH_PARTS = /authorization|token|password|pin|secret|key/i;
const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
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

function safeTraceId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return TRACE_ID_PATTERN.test(trimmed) ? trimmed : null;
}

function hashReference(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Records one bounded, privacy-safe trace for every API request.
 * Request bodies, authorization headers, IP addresses, plates, payment data,
 * raw actor IDs, and raw garage IDs are deliberately excluded. Business records
 * and domain events remain the source of truth for detailed customer data.
 */
export function operationTraceMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const correlationId = safeTraceId(req.correlationId) || crypto.randomUUID();
  const operationId = safeTraceId(req.headers['x-operation-id']);

  res.on('finish', () => {
    if (!adminDb || !req.path.startsWith('/api/')) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + TRACE_RETENTION_MS);
    const statusCode = res.statusCode;
    const outcome = statusCode >= 500 ? 'server_error' : statusCode >= 400 ? 'client_error' : 'success';
    const trace = {
      schemaVersion: 2,
      correlationId,
      operationId,
      method: req.method,
      path: safePath(req.path),
      statusCode,
      outcome,
      errorCode: res.locals?.apiErrorCode || null,
      durationMs: Math.max(0, Date.now() - startedAt),
      actorUidHash: hashReference(req.user?.uid),
      actorRole: req.user?.role || null,
      garageIdHash: hashReference(req.user?.garageId),
      occurredAt: now,
      expiresAt,
    };

    if (statusCode >= 400) {
      console.warn('[OperationTrace] API request failed', {
        correlationId,
        operationId,
        method: trace.method,
        path: trace.path,
        statusCode,
        outcome,
        errorCode: trace.errorCode,
        durationMs: trace.durationMs,
      });
    }

    // Fire-and-forget avoids delaying the customer response. The trace is
    // diagnostic evidence, while transaction/event records remain authoritative.
    void adminDb.doc(`operation_traces/${traceDocumentId(correlationId)}`).set(trace).catch((error) => {
      console.error('[OperationTrace] Failed to persist trace', {
        correlationId,
        operationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  traceContextStorage.run({ correlationId, operationId: operationId || undefined }, next);
}

export function getTraceContext(): TraceContext | undefined {
  return traceContextStorage.getStore();
}

export function operationTraceDocumentId(correlationId: string): string {
  return traceDocumentId(correlationId);
}
