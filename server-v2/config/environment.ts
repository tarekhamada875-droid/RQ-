import { z } from 'zod';

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  V2_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  V2_PREVIEW_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  V2_PREVIEW_AUTH_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  V2_PROJECTION_REPAIR_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  V2_PROJECTION_STATUS_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  V2_SHADOW_COMPARISON_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  V2_CORS_ALLOWED_ORIGINS: z.string().default(''),
  V2_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(60),
  V2_RATE_LIMIT_PACKAGE_READ_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(60),
  V2_RATE_LIMIT_GARAGE_SUMMARY_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(30),
  V2_RATE_LIMIT_PENDING_READ_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(30),
  V2_RATE_LIMIT_ACTIVITY_READ_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(60),
  V2_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIRESTORE_EMULATOR_HOST: z.string().regex(/^[^:]+:\d+$/).default('127.0.0.1:8080'),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().regex(/^[^:]+:\d+$/).default('127.0.0.1:9099')
});

export type V2Environment = z.infer<typeof EnvironmentSchema>;

export function parseEnvironment(input: Record<string, string | undefined>): V2Environment {
  const parsed = EnvironmentSchema.parse(input);
  if (parsed.NODE_ENV === 'production' && !parsed.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID is required in production');
  }
  return parsed;
}
