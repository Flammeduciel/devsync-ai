import type { Logger } from '@devsync/config';
import { redisChannels, type ControlMessage } from '@devsync/protocol';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { StoredEvent } from './events/event-store';
import type { RealtimeServer } from './server';

/**
 * Wires the gateway to Redis: Socket.IO adapter (several instances behind a load balancer),
 * subscription to committed events and to control messages from the web app.
 */
export async function connectRedis(server: RealtimeServer, redisUrl: string, logger: Logger) {
  const pub = new Redis(redisUrl);
  const sub = pub.duplicate();
  const events = pub.duplicate();
  server.io.adapter(createAdapter(pub, sub));

  await events.subscribe(redisChannels.events, redisChannels.control);
  events.on('message', (channel, raw) => {
    try {
      if (channel === redisChannels.events) server.ingest(JSON.parse(raw) as StoredEvent);
      else if (channel === redisChannels.control)
        void server.control(JSON.parse(raw) as ControlMessage);
    } catch (error) {
      logger.warn({ err: error, channel }, 'dropped malformed message');
    }
  });

  return {
    close: async () => {
      await events.quit();
      await sub.quit();
      await pub.quit();
    },
  };
}
