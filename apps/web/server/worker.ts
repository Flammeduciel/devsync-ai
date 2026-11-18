/**
 * Background worker (BullMQ). Same services and repositories as the web app, separate process.
 *   pnpm --filter @devsync/web worker                  # all roles
 *   WORKER_ROLES=maintenance pnpm --filter @devsync/web worker
 * Roles: maintenance (session sweeps) and embeddings (local model for knowledge search). On platforms
 * without an ONNX runtime binary (Intel Macs), run the embeddings role in Docker: `pnpm dev:embedder`.
 */
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { services } from './container';
import { serverEnv } from './env';
import { createLocalEmbeddings } from './infrastructure/embeddings';
import { logger } from './infrastructure/logger';
import { EMBEDDINGS_QUEUE, jobs, MAINTENANCE_QUEUE } from './jobs/queues';

const roles = new Set((process.env.WORKER_ROLES ?? 'maintenance,embeddings').split(',').map((r) => r.trim()));
const connection = new Redis(serverEnv().REDIS_URL, { maxRetriesPerRequest: null });
const closers: (() => Promise<void>)[] = [];

if (roles.has('maintenance')) {
  const queue = new Queue(MAINTENANCE_QUEUE, { connection });
  await queue.upsertJobScheduler(jobs.sweepStaleSessions.name, { every: jobs.sweepStaleSessions.everyMs }, {
    name: jobs.sweepStaleSessions.name,
    opts: { removeOnComplete: 100, removeOnFail: 500 },
  });
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async (job) => {
      if (job.name !== jobs.sweepStaleSessions.name) throw new Error(`Unknown job ${job.name}`);
      const closed = await services().agents.sweepStaleSessions();
      const offline = await services().agents.sweepIdleAgents();
      if (closed > 0 || offline > 0) logger.info({ closed, offline }, 'agent sweep');
      return { closed, offline };
    },
    { connection, concurrency: 1 },
  );
  worker.on('failed', (job, error) => logger.error({ job: job?.name, err: error }, 'job failed'));
  closers.push(() => worker.close(), () => queue.close());
  logger.info('maintenance role started');
}

if (roles.has('embeddings')) {
  const provider = createLocalEmbeddings();
  try {
    const started = Date.now();
    await provider.embedQuery('warm up'); // downloads the model on first run
    logger.info({ model: provider.model, ms: Date.now() - started }, 'embedding model ready');
    const queue = new Queue(EMBEDDINGS_QUEUE, { connection });
    await queue.upsertJobScheduler(jobs.embedPending.name, { every: jobs.embedPending.everyMs }, { name: jobs.embedPending.name, opts: { removeOnComplete: 50, removeOnFail: 100 } });
    const worker = new Worker(
      EMBEDDINGS_QUEUE,
      async (job) => {
        switch (job.name) {
          case jobs.embedQuery.name:
            return provider.embedQuery(String(job.data.text ?? ''));
          case jobs.embedKnowledge.name:
            await services().knowledge.embedOne(provider, String(job.data.knowledgeId));
            return { ok: true };
          case jobs.embedPending.name:
            return { embedded: await services().knowledge.embedPending(provider) };
          default:
            throw new Error(`Unknown job ${job.name}`);
        }
      },
      { connection, concurrency: 2 },
    );
    worker.on('failed', (job, error) => logger.error({ job: job?.name, err: error }, 'embedding job failed'));
    closers.push(() => worker.close(), () => queue.close());
    logger.info('embeddings role started');
  } catch (error) {
    // Without a worker on the queue, search transparently falls back to full-text.
    logger.error({ err: (error as Error).message }, 'embedding model unavailable on this platform: semantic search disabled (run `pnpm dev:embedder`)');
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, 'worker shutting down');
    for (const close of closers) await close();
    connection.disconnect();
    process.exit(0);
  });
}
