import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'CONFIGURATION_ERROR',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'UNAUTHORIZED'
]);

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  code: ErrorCodeSchema,
  requestId: z.string().uuid()
});

export const ApiSuccessSchema = z.object({
  success: z.literal(true),
  requestId: z.string().uuid()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiSuccess<T> = { success: true; requestId: string; data: T };

export function successResponse<T>(requestId: string, data: T): ApiSuccess<T> {
  return { success: true, requestId, data };
}

export function errorResponse(
  requestId: string,
  code: ApiError['code'],
  error: string
): ApiError {
  return { success: false, error, code, requestId };
}
