import { z } from 'zod';

export const VehicleStateSchema = z.object({
  id: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  plate: z.string().min(2).max(32),
  status: z.enum(['inside', 'outside']),
  entryAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

export const VehicleOperationSchema = z.object({
  operationId: z.string().min(1).max(160),
  operation: z.enum(['check_in', 'check_out']),
  vehicleId: z.string().min(1).max(160),
  garageId: z.string().min(1).max(160),
  plate: z.string().min(2).max(32),
  occurredAt: z.string().datetime({ offset: true })
}).strict();

export type VehicleState = z.infer<typeof VehicleStateSchema>;
export type VehicleOperation = z.infer<typeof VehicleOperationSchema>;
