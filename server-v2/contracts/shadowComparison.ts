import { z } from 'zod';
import { DateKeySchema } from './summary.js';
import type { ShadowComparisonOutcome } from '../migration/shadowComparisonCoordinator.js';

export const ShadowComparisonRequestSchema = z.object({
  endpoint: z.enum(['packages', 'garage_summary']),
  garageId: z.string().min(1).max(160).optional(),
  date: DateKeySchema.optional()
}).strict().superRefine((value, context) => {
  if (value.endpoint === 'garage_summary' && (!value.garageId || !value.date)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['garageId'], message: 'garageId and date are required for garage_summary' });
  }
});

export type ShadowComparisonRequest = z.infer<typeof ShadowComparisonRequestSchema>;
export type ShadowComparisonProvider = (input: ShadowComparisonRequest & { requestId: string }) => Promise<ShadowComparisonOutcome>;
