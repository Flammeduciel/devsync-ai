import type { Redis } from 'ioredis';

export const PRESENCE_TTL_SECONDS = 90;
export const presenceKey = (machineId: string) => `presence:machine:${machineId}`;

/**
 * Bridge connection presence. A counter per machine (several sockets or gateway instances) with a
 * TTL refreshed while connected, so a crashed gateway does not leave machines "online" forever.
 */
export function createPresence(redis: Redis) {
  return {
    async connect(machineId: string) {
      await redis
        .multi()
        .incr(presenceKey(machineId))
        .expire(presenceKey(machineId), PRESENCE_TTL_SECONDS)
        .exec();
    },
    async refresh(machineId: string) {
      await redis.expire(presenceKey(machineId), PRESENCE_TTL_SECONDS);
    },
    async disconnect(machineId: string) {
      const left = await redis.decr(presenceKey(machineId));
      if (left <= 0) await redis.del(presenceKey(machineId));
    },
  };
}
export type Presence = ReturnType<typeof createPresence>;
