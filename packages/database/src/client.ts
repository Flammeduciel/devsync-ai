import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export type DatabaseClient = PrismaClient;

export function createDatabaseClient(connectionString: string): DatabaseClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { __devsyncPrisma?: DatabaseClient };

/**
 * Process-wide singleton. Reused across Next.js hot reloads in development so we
 * don't exhaust PostgreSQL connections.
 */
export function getDatabase(): DatabaseClient {
  if (!globalForPrisma.__devsyncPrisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    globalForPrisma.__devsyncPrisma = createDatabaseClient(url);
  }
  return globalForPrisma.__devsyncPrisma;
}
