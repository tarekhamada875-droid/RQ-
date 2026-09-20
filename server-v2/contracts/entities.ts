import { z } from 'zod';

const IdSchema = z.string().min(1).max(160);
const IsoDateSchema = z.string().datetime({ offset: true });

export const GarageSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(160),
  isLocked: z.boolean(),
  isSuspended: z.boolean(),
  capacity: z.number().int().nonnegative(),
  carsInside: z.number().int().nonnegative(),
  updatedAt: IsoDateSchema
}).strict();

export const PackageSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(160),
  durationDays: z.number().int().positive(),
  vehicleLimit: z.number().int().nonnegative(),
  priceMinor: z.number().int().nonnegative(),
  active: z.boolean()
}).strict();

export const WalletAccountSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  balanceMinor: z.number().int(),
  version: z.number().int().nonnegative(),
  updatedAt: IsoDateSchema
}).strict();

export const FinancialEventSchema = z.object({
  id: IdSchema,
  accountId: IdSchema,
  kind: z.enum(['credit', 'debit', 'refund', 'correction']),
  amountMinor: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
  occurredAt: IsoDateSchema
}).strict();

export const SessionSchema = z.object({
  id: IdSchema,
  uid: IdSchema,
  role: z.enum(['admin', 'supervisor', 'delegate', 'garage', 'staff']),
  garageId: IdSchema.optional(),
  expiresAt: IsoDateSchema,
  lastActiveAt: IsoDateSchema,
  revoked: z.boolean()
}).strict();

export type Garage = z.infer<typeof GarageSchema>;
export type Package = z.infer<typeof PackageSchema>;
export type WalletAccount = z.infer<typeof WalletAccountSchema>;
export type FinancialEvent = z.infer<typeof FinancialEventSchema>;
export type Session = z.infer<typeof SessionSchema>;
