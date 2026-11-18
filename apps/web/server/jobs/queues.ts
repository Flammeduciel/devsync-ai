export const MAINTENANCE_QUEUE = 'devsync-maintenance';

export const jobs = {
  sweepStaleSessions: { name: 'sweep-stale-sessions', everyMs: 30_000 },
} as const;
