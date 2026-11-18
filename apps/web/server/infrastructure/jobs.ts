import 'server-only';
import { Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type { JobQueue, QueryEmbedder } from '../services/jobs';
import { serverEnv } from '../env';
import { EMBEDDINGS_QUEUE, jobs } from '../jobs/queues';
import { logger } from './logger';

const globalForJobs = globalThis as unknown as {
  __devsyncEmbeddingsQueue?: Queue;
  __devsyncEmbeddingsEvents?: QueueEvents;
};

function connection() {
  return new Redis(serverEnv().REDIS_URL, { maxRetriesPerRequest: null });
}

function embeddingsQueue(): Queue {
  globalForJobs.__devsyncEmbeddingsQueue ??= new Queue(EMBEDDINGS_QUEUE, {
    connection: connection(),
  });
  return globalForJobs.__devsyncEmbeddingsQueue;
}

function embeddingsEvents(): QueueEvents {
  globalForJobs.__devsyncEmbeddingsEvents ??= new QueueEvents(EMBEDDINGS_QUEUE, {
    connection: connection(),
  });
  return globalForJobs.__devsyncEmbeddingsEvents;
}

export const bullJobs: JobQueue = {
  async enqueue(name, data, options) {
    await embeddingsQueue().add(name, data, {
      removeOnComplete: 200,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      ...(options?.jobId ? { jobId: options.jobId } : {}),
    });
  },
};

let workersCheckedAt = 0;
let workersAvailable = false;

/**
 * Asks the embeddings worker for a query vector. Returns null quickly when no worker is running or it
 * does not answer in time: search then falls back to full-text only.
 */
export const workerQueryEmbedder: QueryEmbedder = {
  model: process.env.EMBEDDING_MODEL ?? 'Xenova/multilingual-e5-small',
  async embedQuery(text) {
    try {
      if (Date.now() - workersCheckedAt > 30_000) {
        workersAvailable = (await embeddingsQueue().getWorkersCount()) > 0;
        workersCheckedAt = Date.now();
      }
      if (!workersAvailable) return null;
      // Results must outlive completion long enough for waitUntilFinished to read them.
      const job = await embeddingsQueue().add(
        jobs.embedQuery.name,
        { text },
        { removeOnComplete: { age: 60 }, removeOnFail: { age: 60 }, priority: 1 },
      );
      const vector = (await job.waitUntilFinished(embeddingsEvents(), 4000)) as number[];
      return Array.isArray(vector) && vector.length === 384 ? vector : null;
    } catch (error) {
      logger.warn(
        { err: (error as Error).message },
        'query embedding unavailable, using full-text search only',
      );
      return null;
    }
  },
};

export async function embeddingWorkerCount(): Promise<number> {
  try {
    return await embeddingsQueue().getWorkersCount();
  } catch {
    return 0;
  }
}
