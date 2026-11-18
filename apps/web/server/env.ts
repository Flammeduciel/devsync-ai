import 'server-only';
import { authEnv, commonEnv, databaseEnv, loadEnv, redisEnv, storageEnv } from '@devsync/config';
import { z } from 'zod';

const serverEnvSchema = z.object({
  ...commonEnv,
  ...databaseEnv,
  ...redisEnv,
  ...storageEnv,
  ...authEnv,
  REALTIME_URL: z.url(),
  REALTIME_JWT_SECRET: z.string().min(32),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Validated server-side environment. Never import this from a Client Component. */
export function serverEnv(): ServerEnv {
  cached ??= loadEnv(serverEnvSchema);
  return cached;
}
