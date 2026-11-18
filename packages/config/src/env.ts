import { z } from 'zod';

/**
 * Validates `source` (defaults to process.env) against a Zod schema and fails fast
 * with a readable message listing every invalid variable. Each app declares only the
 * variables it actually needs.
 */
export function loadEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

export const logLevelSchema = z
  .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  .default('info');

/** Building blocks reused by app-level schemas. */
export const commonEnv = {
  NODE_ENV: nodeEnvSchema,
  LOG_LEVEL: logLevelSchema,
};

export const databaseEnv = {
  DATABASE_URL: z.url().startsWith('postgres', 'DATABASE_URL must be a PostgreSQL URL'),
};

export const redisEnv = {
  REDIS_URL: z.url().startsWith('redis', 'REDIS_URL must be a redis:// URL'),
};

export const storageEnv = {
  S3_ENDPOINT: z.url(),
  /** Public URL of the same storage, used in presigned links given to browsers and Bridges (defaults to S3_ENDPOINT). */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
};

export const authEnv = {
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  APP_URL: z.url(),
};
