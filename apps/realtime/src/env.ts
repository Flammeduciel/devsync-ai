import { commonEnv, databaseEnv, loadEnv, redisEnv } from '@devsync/config';
import { z } from 'zod';

export const realtimeEnvSchema = z.object({
  ...commonEnv,
  ...databaseEnv,
  ...redisEnv,
  REALTIME_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  REALTIME_JWT_SECRET: z.string().min(32),
  APP_URL: z.url(),
});

export type RealtimeEnv = z.infer<typeof realtimeEnvSchema>;

export const loadRealtimeEnv = (source?: Record<string, string | undefined>): RealtimeEnv =>
  loadEnv(realtimeEnvSchema, source);
