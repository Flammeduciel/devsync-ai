import 'server-only';
import { AppError } from '@devsync/shared';
import { redis } from './redis';

/** Fixed-window limiter on Redis. Throws RATE_LIMITED when `key` exceeds `max` per window. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  const redisKey = `rl:${key}`;
  const [[, count]] = (await redis().multi().incr(redisKey).expire(redisKey, windowSeconds, 'NX').exec()) as [[Error | null, number]];
  if (count > max) throw new AppError('RATE_LIMITED', 'Too many requests, slow down');
}

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
