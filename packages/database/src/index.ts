export * from './client';
export * from './errors';
export * from './generated/prisma/client';

import type { Prisma, PrismaClient } from './generated/prisma/client';

/** A Prisma client or an interactive-transaction client: what repositories accept. */
export type Db = PrismaClient | Prisma.TransactionClient;
