import { z } from 'zod';
import { VehicleStateSchema } from './vehicle.js';

export const VehicleCheckInInputSchema = z.object({
  garageId: z.string().min(1).max(160),
  plate: z.string().min(2).max(32),
  plateRaw: z.string().min(2).max(32),
  type: z.string().min(1).max(40).default('hourly'),
  occurredAt: z.string().datetime({ offset: true }),
  actorUid: z.string().min(1).max(160),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const VehicleCheckInContextSchema = z.object({
  garageId: z.string().min(1).max(160),
  garageName: z.string().min(1).max(160),
  isLocked: z.boolean(),
  isSuspended: z.boolean(),
  isDeleting: z.boolean(),
  subscriptionExpiresAt: z.string().datetime({ offset: true }),
  dailyCapacity: z.number().int().nonnegative(),
  dailyCount: z.number().int().nonnegative(),
  carsInside: z.number().int().nonnegative(),
  isUnlimited: z.boolean(),
  fairUseAllowed: z.boolean(),
  activeSubscriber: z.boolean(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();

export const VehicleCheckInResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  vehicle: VehicleStateSchema,
  carsInside: z.number().int().nonnegative(),
  dailyCount: z.number().int().nonnegative(),
  dailyCapacity: z.number().int().nonnegative()
}).strict();

export type VehicleCheckInInput = z.infer<typeof VehicleCheckInInputSchema>;
export type VehicleCheckInContext = z.infer<typeof VehicleCheckInContextSchema>;
export type VehicleCheckInResult = z.infer<typeof VehicleCheckInResultSchema>;
