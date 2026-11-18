import 'server-only';
import { Redis } from 'ioredis';
import { serverEnv } from '../env';

const globalForRedis = globalThis as unknown as { __devsyncRedis?: Redis };

export function redis(): Redis {
  globalForRedis.__devsyncRedis ??= new Redis(serverEnv().REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
  return globalForRedis.__devsyncRedis;
}
