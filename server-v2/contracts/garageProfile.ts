import { z } from 'zod';

const IdSchema = z.string().min(1).max(160);
const NonEmptyText = (max: number) => z.string().trim().min(1).max(max);

export const GarageProfileMutableFieldsSchema = z.object({
  name: NonEmptyText(160).optional(),
  phone: NonEmptyText(40).optional(),
  ownerName: NonEmptyText(160).optional(),
  dailyCapacity: z.number().int().min(0).max(100000).optional(),
  isMaintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  warningDaysThreshold: z.number().int().min(0).max(3650).optional(),
  checkInSound: z.string().max(160).optional(),
  checkOutSound: z.string().max(160).optional(),
  shimmerColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
}).strict();

const ProfileUpdateShape = {
  ...GarageProfileMutableFieldsSchema.shape,
  idempotencyKey: z.string().min(8).max(128)
};

export const GarageProfileUpdateRequestSchema = z.object(ProfileUpdateShape).strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'idempotencyKey'),
  { message: 'At least one mutable profile field is required' }
);

export const GarageProfileUpdateInputSchema = z.object({
  garageId: IdSchema,
  actorUid: IdSchema,
  occurredAt: z.string().datetime({ offset: true }),
  ...ProfileUpdateShape
}).strict().refine(
  (value) => Object.keys(value).some((key) => !['garageId', 'actorUid', 'occurredAt', 'idempotencyKey'].includes(key)),
  { message: 'At least one mutable profile field is required' }
);

export const GarageProfileStateSchema = z.object({
  id: IdSchema,
  name: NonEmptyText(160),
  phone: z.string().max(40).optional(),
  ownerName: z.string().max(160).optional(),
  dailyCapacity: z.number().int().min(0).max(100000).optional(),
  isMaintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  warningDaysThreshold: z.number().int().min(0).max(3650).optional(),
  checkInSound: z.string().max(160).optional(),
  checkOutSound: z.string().max(160).optional(),
  shimmerColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

export const GarageProfileUpdateResultSchema = z.object({
  garage: GarageProfileStateSchema
}).strict();

export type GarageProfileMutableFields = z.infer<typeof GarageProfileMutableFieldsSchema>;
export type GarageProfileUpdateRequest = z.infer<typeof GarageProfileUpdateRequestSchema>;
export type GarageProfileUpdateInput = z.infer<typeof GarageProfileUpdateInputSchema>;
export type GarageProfileState = z.infer<typeof GarageProfileStateSchema>;
export type GarageProfileUpdateResult = z.infer<typeof GarageProfileUpdateResultSchema>;

export const GARAGE_PROFILE_MUTABLE_FIELDS = Object.freeze([
  'name', 'phone', 'ownerName', 'dailyCapacity', 'isMaintenanceMode',
  'maintenanceMessage', 'warningDaysThreshold', 'checkInSound', 'checkOutSound', 'shimmerColor'
] as const);

export type GarageProfileMutableField = typeof GARAGE_PROFILE_MUTABLE_FIELDS[number];
