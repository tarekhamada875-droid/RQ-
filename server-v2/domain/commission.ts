import { z } from 'zod';

export const CommissionScheduleSchema = z.object({
  daily: z.number().int().nonnegative(),
  weekly: z.number().int().nonnegative(),
  biweekly: z.number().int().nonnegative(),
  monthly: z.number().int().nonnegative()
}).strict();

export type CommissionSchedule = z.infer<typeof CommissionScheduleSchema>;

export function commissionForDuration(durationDays: number, schedule: CommissionSchedule): number {
  const parsed = CommissionScheduleSchema.parse(schedule);
  if (!Number.isInteger(durationDays) || durationDays < 1) throw new Error('Invalid package duration');
  if (durationDays <= 1) return parsed.daily;
  if (durationDays <= 7) return parsed.weekly;
  if (durationDays <= 15) return parsed.biweekly;
  return parsed.monthly;
}
