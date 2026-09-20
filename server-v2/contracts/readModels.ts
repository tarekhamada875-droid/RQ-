import { z } from 'zod';

const Id = z.string().min(1).max(160);
const Iso = z.string().datetime({ offset: true });

export const PendingQueueItemSchema = z.object({
  id: Id, garageId: Id, kind: z.enum(['recharge', 'approval', 'repair']), priority: z.number().int().min(0).max(100), createdAt: Iso, status: z.literal('pending')
}).strict();

export const ActivityRecordSchema = z.object({
  id: Id, garageId: Id, type: z.string().min(1).max(120), occurredAt: Iso, resultCode: z.string().min(1).max(120), projectionVersion: z.number().int().positive()
}).strict();

export type PendingQueueItem = z.infer<typeof PendingQueueItemSchema>;
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>;
