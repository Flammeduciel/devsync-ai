import { Prisma } from './generated/prisma/client';

/** True when `error` is a unique-constraint violation (optionally on a given field). */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (!field) return true;
  const target = JSON.stringify(error.meta ?? {});
  return target.includes(field);
}
