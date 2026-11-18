import type { AgentStatus } from '@devsync/validation';

/** When several sessions run, the agent shows the most significant state. */
const PRIORITY: Record<AgentStatus, number> = {
  ERROR: 5,
  WORKING: 4,
  WAITING: 3,
  IDLE: 2,
  ONLINE: 1,
  OFFLINE: 0,
};

export function aggregateAgentStatus(activeSessionStatuses: AgentStatus[]): AgentStatus {
  if (activeSessionStatuses.length === 0) return 'OFFLINE';
  return activeSessionStatuses.reduce(
    (best, s) => (PRIORITY[s] > PRIORITY[best] ? s : best),
    'ONLINE' as AgentStatus,
  );
}

/** A session without heartbeat for this long is considered gone (Bridge heartbeats every 30 s). */
export const SESSION_STALE_AFTER_MS = 90_000;

/**
 * After a developer closes a conversation, the agent stays IDLE this long before going OFFLINE, so
 * opening a new conversation right away does not make it blink offline/online for the team.
 */
export const RECONNECT_GRACE_MS = 60_000;
