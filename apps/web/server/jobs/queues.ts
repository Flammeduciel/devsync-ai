export const MAINTENANCE_QUEUE = 'devsync-maintenance';
/** Separate queue so the embedding model can run in its own process/container. */
export const EMBEDDINGS_QUEUE = 'devsync-embeddings';

export const jobs = {
  sweepStaleSessions: { name: 'sweep-stale-sessions', everyMs: 30_000 },
  embedKnowledge: { name: 'embed-knowledge' },
  embedQuery: { name: 'embed-query' },
  embedPending: { name: 'embed-pending', everyMs: 5 * 60_000 },
} as const;
