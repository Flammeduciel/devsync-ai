import { createLogger } from '@devsync/config';
import { Redis } from 'ioredis';
import { createDatabaseClient } from '@devsync/database';
import { createAuthenticator } from './auth/identity';
import { loadRealtimeEnv } from './env';
import { prismaEventStore } from './events/event-store';
import { createPresence } from './presence/presence';
import { connectRedis } from './redis';
import { createRealtimeServer, type RealtimeServer } from './server';

const env = loadRealtimeEnv();
const logger = createLogger('realtime');
const db = createDatabaseClient(env.DATABASE_URL);

const presenceClient = new Redis(env.REDIS_URL);
const server: RealtimeServer = createRealtimeServer({
  corsOrigin: env.APP_URL,
  logger,
  authenticate: createAuthenticator(db, env.REALTIME_JWT_SECRET),
  eventStore: prismaEventStore(db),
  presence: createPresence(presenceClient),
});
const redis = await connectRedis(server, env.REDIS_URL, logger);

server.http.listen(env.REALTIME_PORT, () => {
  logger.info({ port: env.REALTIME_PORT }, 'realtime gateway listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    void server
      .close()
      .then(() => redis.close())
      .then(() => presenceClient.quit())
      .then(() => db.$disconnect())
      .then(() => process.exit(0));
  });
}
