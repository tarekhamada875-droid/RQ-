import { z } from 'zod';

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  V2_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
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
