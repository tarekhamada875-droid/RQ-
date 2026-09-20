import crypto from 'node:crypto';
import { z } from 'zod';
import type { AuthorizationContext } from '../contracts/auth.js';

export const RequestContextSchema = z.object({
  requestId: z.string().uuid(),
  actorUid: z.string().min(1).max(160).optional(),
  tenantId: z.string().min(1).max(160).optional(),
  sessionIdHash: z.string().length(64).optional(),
  route: z.string().min(1).max(240),
  operation: z.string().min(1).max(120),
  resultCode: z.string().min(1).max(120),
  latencyMs: z.number().int().nonnegative(),
  firestoreReads: z.number().int().nonnegative(),
  firestoreWrites: z.number().int().nonnegative(),
  firestoreDeletes: z.number().int().nonnegative(),
  transactionRetries: z.number().int().nonnegative(),
  projectionLagMs: z.number().int().nonnegative().optional()
}).strict();

export type RequestContext = z.infer<typeof RequestContextSchema>;

export function hashSessionId(sessionId: string): string {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

export function createRequestContext(input: Readonly<{
  requestId: string;
  route: string;
  operation: string;
  resultCode: string;
  latencyMs: number;
  authorization?: AuthorizationContext;
  firestoreReads?: number;
  firestoreWrites?: number;
  firestoreDeletes?: number;
  transactionRetries?: number;
  projectionLagMs?: number;
}>): RequestContext {
  return RequestContextSchema.parse({
    requestId: input.requestId,
    actorUid: input.authorization?.uid,
    tenantId: input.authorization?.garageId,
    sessionIdHash: input.authorization ? hashSessionId(input.authorization.sessionId) : undefined,
    route: input.route,
    operation: input.operation,
    resultCode: input.resultCode,
    latencyMs: input.latencyMs,
    firestoreReads: input.firestoreReads ?? 0,
    firestoreWrites: input.firestoreWrites ?? 0,
    firestoreDeletes: input.firestoreDeletes ?? 0,
    transactionRetries: input.transactionRetries ?? 0,
    projectionLagMs: input.projectionLagMs
  });
}
