import { z } from 'zod';
import { SessionSchema } from './entities.js';

export const AuthorizationContextSchema = z.object({
  uid: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160),
  role: SessionSchema.shape.role,
  garageId: z.string().min(1).max(160).optional(),
  delegateGarageIds: z.array(z.string().min(1).max(160)).max(1000).default([])
}).strict();

export type AuthorizationContext = z.infer<typeof AuthorizationContextSchema>;

export const SessionValidationReasonSchema = z.enum([
  'valid',
  'missing_token',
  'owner_mismatch',
  'session_mismatch',
  'revoked',
  'expired',
  'stale'
]);

export type SessionValidationReason = z.infer<typeof SessionValidationReasonSchema>;
export type SessionValidationResult = Readonly<{
  valid: boolean;
  reason: SessionValidationReason;
  context?: AuthorizationContext;
}>;
