import { randomUUID } from 'node:crypto';

/**
 * Identifiers are UUIDv7-like: time-ordered (good B-tree locality in PostgreSQL)
 * and globally unique, so clients (Bridge, MCP) can generate event ids offline.
 */
export function newId(now: number = Date.now()): string {
  const random = randomUUID().replace(/-/g, '');
  const time = now.toString(16).padStart(12, '0').slice(-12);
  // version 7 nibble + variant bits (10xx)
  const variant = ((parseInt(random[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const hex = `${time}7${random.slice(13, 16)}${variant}${random.slice(17, 32)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_RE.test(value);
