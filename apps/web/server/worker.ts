/**
 * Background worker (BullMQ). Same services and repositories as the web app, separate process:
 *   pnpm --filter @devsync/web worker
 */
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { services } from './container';
import { serverEnv } from './env';
import { jobs, MAINTENANCE_QUEUE } from './jobs/queues';
import { logger } from './infrastructure/logger';

const connection = new Redis(serverEnv().REDIS_URL, { maxRetriesPerRequest: null });

const queue = new Queue(MAINTENANCE_QUEUE, { connection });
await queue.upsertJobScheduler(
  jobs.sweepStaleSessions.name,
  { every: jobs.sweepStaleSessions.everyMs },
  {
    name: jobs.sweepStaleSessions.name,
    opts: { removeOnComplete: 100, removeOnFail: 500 },
  },
);

const worker = new Worker(
  MAINTENANCE_QUEUE,
  async (job) => {
    if (job.name === jobs.sweepStaleSessions.name) {
      const closed = await services().agents.sweepStaleSessions();
      const offline = await services().agents.sweepIdleAgents();
      if (closed > 0 || offline > 0) logger.info({ closed, offline }, 'agent sweep');
      return { closed, offline };
    }
    throw new Error(`Unknown job ${job.name}`);
  },
  { connection, concurrency: 1 },
);

worker.on('failed', (job, error) => logger.error({ job: job?.name, err: error }, 'job failed'));
logger.info({ queue: MAINTENANCE_QUEUE }, 'worker started');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, 'worker shutting down');
    await worker.close();
    await queue.close();
    connection.disconnect();
    process.exit(0);
  });
}
