import type { AgentStatus } from '@devsync/validation';

/** When several sessions run, the agent shows the most significant state. */
const PRIORITY: Record<AgentStatus, number> = { ERROR: 5, WORKING: 4, WAITING: 3, IDLE: 2, ONLINE: 1, OFFLINE: 0 };

export function aggregateAgentStatus(activeSessionStatuses: AgentStatus[]): AgentStatus {
  if (activeSessionStatuses.length === 0) return 'OFFLINE';
  return activeSessionStatuses.reduce((best, s) => (PRIORITY[s] > PRIORITY[best] ? s : best), 'ONLINE' as AgentStatus);
}

/** A session without heartbeat for this long is considered gone (Bridge heartbeats every 30 s). */
export const SESSION_STALE_AFTER_MS = 90_000;
