import type { DatabaseClient } from '@devsync/database';
import type { Envelope } from '@devsync/protocol';
import { PROTOCOL_VERSION } from '@devsync/protocol';

export interface StoredEvent extends Envelope {
  audience?: string[];
}

/** Read side of the outbox, used to replay events a client missed. */
export interface EventStore {
  since(teamId: string, afterSequence: number, limit: number): Promise<StoredEvent[]>;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function prismaEventStore(db: DatabaseClient): EventStore {
  return {
    async since(teamId, afterSequence, limit) {
      const rows = await db.event.findMany({
        where: { teamId, sequence: { gt: BigInt(afterSequence) }, createdAt: { gt: new Date(Date.now() - MAX_AGE_MS) } },
        orderBy: { sequence: 'asc' },
        take: limit,
      });
      return rows.map((row) => ({
        id: row.id,
        type: row.type,
        version: PROTOCOL_VERSION,
        timestamp: row.createdAt.toISOString(),
        teamId: row.teamId,
        ...(row.projectId ? { projectId: row.projectId } : {}),
        actor: row.actor as Envelope['actor'],
        sequence: Number(row.sequence),
        payload: row.payload,
        ...(row.audience.length ? { audience: row.audience } : {}),
      }));
    },
  };
}
