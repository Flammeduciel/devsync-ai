import 'server-only';
import { AppError } from '@devsync/shared';
import { redis } from './redis';

/** Fixed-window limiter on Redis. Throws RATE_LIMITED when `key` exceeds `max` per window. */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  const redisKey = `rl:${key}`;
  const [[, count]] = (await redis()
    .multi()
    .incr(redisKey)
    .expire(redisKey, windowSeconds, 'NX')
    .exec()) as [[Error | null, number]];
  if (count > max) throw new AppError('RATE_LIMITED', 'Too many requests, slow down');
}

/**
 * Client IP behind reverse proxies. Each trusted proxy (Traefik on Dokploy = 1) appends the address it saw,
 * so the real client is the entry TRUSTED_PROXY_HOPS from the end; earlier entries can be forged.
 */
export function clientIp(request: Request): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));
  const chain = (request.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return chain[chain.length - hops] ?? request.headers.get('x-real-ip') ?? 'unknown';
}
