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

export const VehicleCheckInRequestSchema = z.object({
  plate: z.string().min(2).max(32),
  plateRaw: z.string().min(2).max(32),
  type: z.string().min(1).max(40).default('hourly'),
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

export const VehicleCheckOutInputSchema = z.object({
  garageId: z.string().min(1).max(160),
  vehicleId: z.string().min(1).max(160),
  actorUid: z.string().min(1).max(160),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(8).max(128)
}).strict();

export const VehicleCheckOutResultSchema = z.object({
  operationId: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  vehicleId: z.string().min(1).max(160),
  cost: z.number().nonnegative(),
  currency: z.literal('EGP')
}).strict();

export type VehicleCheckInInput = z.infer<typeof VehicleCheckInInputSchema>;
export type VehicleCheckInRequest = z.infer<typeof VehicleCheckInRequestSchema>;
export type VehicleCheckInContext = z.infer<typeof VehicleCheckInContextSchema>;
export type VehicleCheckInResult = z.infer<typeof VehicleCheckInResultSchema>;
export type VehicleCheckOutInput = z.infer<typeof VehicleCheckOutInputSchema>;
export type VehicleCheckOutResult = z.infer<typeof VehicleCheckOutResultSchema>;
