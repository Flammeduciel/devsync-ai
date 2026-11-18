import { randomUUID } from 'node:crypto';
import { readJson, writeJsonAtomic } from '../config';

export type OutboxKind = 'activity' | 'end';

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  /** Claude Code session id; resolved to the server session id when sending. */
  sessionKey: string;
  body: Record<string, unknown>;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
}

export const MAX_BACKOFF_MS = 60_000;
/** Older items are dropped: the information is stale and the server would reject old sessions anyway. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function backoffMs(attempts: number, random = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts);
  return Math.round(base / 2 + (random() * base) / 2);
}

/**
 * Persistent FIFO of calls that must reach the server (activities, session ends). Survives daemon
 * restarts; items carry stable ids so a retry after a lost response is ignored by the server.
 */
export class Outbox {
  private items: OutboxItem[] = [];

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<this> {
    this.items = (await readJson<OutboxItem[]>(this.file, [])).filter(
      (i) => this.now() - i.createdAt < MAX_AGE_MS,
    );
    return this;
  }

  get size(): number {
    return this.items.length;
  }

  async enqueue(
    kind: OutboxKind,
    sessionKey: string,
    body: Record<string, unknown>,
  ): Promise<OutboxItem> {
    const item: OutboxItem = {
      id: randomUUID(),
      kind,
      sessionKey,
      body,
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: this.now(),
    };
    this.items.push(item);
    await this.persist();
    return item;
  }

  /** Items ready to send, oldest first. */
  due(): OutboxItem[] {
    const now = this.now();
    return this.items.filter((i) => i.nextAttemptAt <= now);
  }

  async complete(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
    await this.persist();
  }

  async retryLater(id: string): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    item.attempts += 1;
    item.nextAttemptAt = this.now() + backoffMs(item.attempts);
    await this.persist();
  }

  private persist() {
    return writeJsonAtomic(this.file, this.items);
  }
}
