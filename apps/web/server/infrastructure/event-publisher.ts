import 'server-only';
import { redisChannels, type ControlMessage, type Envelope } from '@devsync/protocol';
import type { EventPublisher } from '../services/events.service';
import { logger } from './logger';
import { redis } from './redis';

export const redisEventPublisher: EventPublisher = {
  async publish(events: Envelope[]) {
    try {
      const pipeline = redis().pipeline();
      for (const event of events) pipeline.publish(redisChannels.events, JSON.stringify(event));
      await pipeline.exec();
    } catch (error) {
      // Events are already committed in the outbox: clients recover them with session:resume.
      logger.warn({ err: error, count: events.length }, 'failed to publish events to realtime');
    }
  },
};

export async function publishControl(message: ControlMessage): Promise<void> {
  await redis().publish(redisChannels.control, JSON.stringify(message));
}
