import type { Redis } from 'ioredis';

const PREFIX = 'auth:';

/** Better Auth secondary storage on Redis (rate-limit counters, verification caches). */
export function redisSecondaryStorage(client: () => Redis) {
  return {
    get: (key: string) => client().get(PREFIX + key),
    getAndDelete: (key: string) => client().getdel(PREFIX + key),
    async set(key: string, value: string, ttl?: number) {
      if (ttl) await client().set(PREFIX + key, value, 'EX', ttl);
      else await client().set(PREFIX + key, value);
    },
    async delete(key: string) {
      await client().del(PREFIX + key);
    },
    /** Atomic increment; the TTL is set when the counter is created. */
    async increment(key: string, ttl: number) {
      const [[, count]] = (await client()
        .multi()
        .incr(PREFIX + key)
        .expire(PREFIX + key, ttl, 'NX')
        .exec()) as [[Error | null, number], [Error | null, number]];
      return count;
    },
  };
}
