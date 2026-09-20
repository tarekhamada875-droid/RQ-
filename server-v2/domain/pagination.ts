import { z } from 'zod';

const CursorPayloadSchema = z.object({
  version: z.literal(1),
  sortValue: z.string().min(1),
  id: z.string().min(1)
});

export type PageCursor = z.infer<typeof CursorPayloadSchema>;

export function encodeCursor(sortValue: string, id: string): string {
  const payload: PageCursor = { version: 1, sortValue, id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): PageCursor {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid page cursor');
  }
  return CursorPayloadSchema.parse(decoded);
}
