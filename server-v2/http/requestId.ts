import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { z } from 'zod';

export function getV2RequestId(request: Request): string {
  const existing = request.v2RequestId;
  if (existing) return existing;
  const header = request.header('X-Request-ID');
  return header && z.string().uuid().safeParse(header).success ? header : randomUUID();
}
