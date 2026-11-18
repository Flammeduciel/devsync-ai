import { createLogger } from '@devsync/config';
import { loadRealtimeEnv } from './env';
import { createRealtimeServer } from './server';

const env = loadRealtimeEnv();
const logger = createLogger('realtime');
const server = createRealtimeServer({ corsOrigin: env.APP_URL, logger });

server.http.listen(env.REALTIME_PORT, () => {
  logger.info({ port: env.REALTIME_PORT }, 'realtime gateway listening');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    void server.close().then(() => process.exit(0));
  });
}
