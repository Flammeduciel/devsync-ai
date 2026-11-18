import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/** URL-safe random secret (default 256 bits). Optional prefix makes tokens recognizable in logs and scanners. */
export const randomToken = (bytes = 32, prefix = ''): string =>
  `${prefix}${randomBytes(bytes).toString('base64url')}`;

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
