import type { Envelope } from '@devsync/protocol';
import type { StoredEvent } from './event-store';

/** Whether a user may receive an event of one of their teams. */
export function canReceive(event: StoredEvent, userId: string, teamIds: readonly string[]): boolean {
  if (!teamIds.includes(event.teamId)) return false;
  return !event.audience?.length || event.audience.includes(userId);
}

/** Internal routing fields never reach clients. */
export function toClient(event: StoredEvent): Envelope {
  const { audience: _audience, ...envelope } = event;
  return envelope;
}

/**
 * Replays start slightly before the client's last sequence: sequences are allocated at insert time,
 * so a transaction can commit after a later one. Clients dedupe by event id.
 */
export const REPLAY_OVERLAP = 50;
export const REPLAY_LIMIT = 500;
