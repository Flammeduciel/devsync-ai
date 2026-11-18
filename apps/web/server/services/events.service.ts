import type { Db, Prisma } from '@devsync/database';
import { eventCatalog, type EventPayload, type EventType } from '@devsync/event-schemas';
import { PROTOCOL_VERSION, type Actor, type Envelope } from '@devsync/protocol';
import { newId } from '@devsync/shared';
import type { ServiceDeps } from './ports';

export interface DraftEvent<T extends EventType = EventType> {
  type: T;
  teamId: string;
  projectId?: string | null;
  actor: Actor;
  payload: EventPayload<T>;
  /** Restrict delivery to these users; empty = the whole team. */
  audience?: string[];
  correlationId?: string;
}

/** Publishes committed envelopes to the realtime gateway (Redis pub/sub in production). */
export interface EventPublisher {
  publish(events: Envelope[]): Promise<void>;
}

/** Inserts the event in the outbox inside the caller's transaction and returns the envelope. */
export async function appendEvent<T extends EventType>(tx: Db, draft: DraftEvent<T>): Promise<Envelope> {
  const payload = eventCatalog[draft.type].parse(draft.payload) as Prisma.InputJsonValue;
  const row = await tx.event.create({
    data: {
      id: newId(),
      teamId: draft.teamId,
      projectId: draft.projectId ?? null,
      type: draft.type,
      actor: draft.actor as Prisma.InputJsonValue,
      payload,
      audience: draft.audience ?? [],
    },
  });
  return {
    id: row.id,
    type: row.type,
    version: PROTOCOL_VERSION,
    timestamp: row.createdAt.toISOString(),
    teamId: row.teamId,
    ...(row.projectId ? { projectId: row.projectId } : {}),
    actor: draft.actor,
    sequence: Number(row.sequence),
    ...(draft.correlationId ? { correlationId: draft.correlationId } : {}),
    payload,
    ...(row.audience.length ? { audience: row.audience } : {}),
  } as Envelope;
}

/**
 * Runs `fn` in a transaction, collecting events through `emit`, and publishes them only after
 * the commit. If publishing fails the events stay in the outbox and clients get them on replay.
 */
export async function withEvents<T>(
  deps: Pick<ServiceDeps, 'db' | 'publisher'>,
  fn: (tx: Db, emit: <E extends EventType>(draft: DraftEvent<E>) => Promise<void>) => Promise<T>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  const events: Envelope[] = [];
  const result = await deps.db.$transaction(async (tx) => {
    events.length = 0;
    return fn(tx, async (draft) => {
      events.push(await appendEvent(tx, draft));
    });
  }, options);
  if (events.length) {
    await deps.publisher.publish(events).catch(() => undefined);
  }
  return result;
}
