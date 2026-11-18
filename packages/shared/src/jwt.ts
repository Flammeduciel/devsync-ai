import { createHmac } from 'node:crypto';
import { safeEqual } from './crypto';

/**
 * Minimal HS256 JWT used for short-lived realtime tokens between the web app and the gateway
 * (both hold the shared secret). Only HS256 is accepted; `exp` is mandatory.
 */
const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

const sign = (input: string, secret: string): string => createHmac('sha256', secret).update(input).digest('base64url');

export function signJwt(claims: Record<string, unknown>, secret: string, ttlSeconds: number, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds })).toString('base64url');
  const input = `${HEADER}.${payload}`;
  return `${input}.${sign(input, secret)}`;
}

export function verifyJwt<T extends Record<string, unknown>>(token: string, secret: string, now = Date.now()): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  if (header !== HEADER || !safeEqual(signature, sign(`${header}.${payload}`, secret))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T & { exp?: unknown };
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
