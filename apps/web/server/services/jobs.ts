/** Background job producer (BullMQ in production). */
export interface JobQueue {
  enqueue(name: string, data: Record<string, unknown>, options?: { jobId?: string }): Promise<void>;
}

/** Turns a search query into a vector, or null when semantic search is unavailable (model not running). */
export interface QueryEmbedder {
  readonly model: string | null;
  embedQuery(text: string): Promise<number[] | null>;
}

export const noJobs: JobQueue = { enqueue: async () => {} };
export const noEmbeddings: QueryEmbedder = { model: null, embedQuery: async () => null };
