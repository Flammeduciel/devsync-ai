import { randomInt } from 'node:crypto';

/** No 0/O, 1/I/L: user codes are read from a terminal and typed in a browser. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const DEVICE_CODE_TTL_SECONDS = 10 * 60;
export const DEVICE_POLL_INTERVAL_SECONDS = 3;

export function generateUserCode(): string {
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** Accepts "abcd efgh", "ABCD-EFGH", "abcdefgh". Returns null when it cannot be a user code. */
export function normalizeUserCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 8 || [...compact].some((c) => !ALPHABET.includes(c))) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}
