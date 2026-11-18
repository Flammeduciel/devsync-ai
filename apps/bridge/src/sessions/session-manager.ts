import { randomUUID } from 'node:crypto';
import {
  DevSyncApiError,
  type DevSyncClient,
  type HeartbeatBody,
  type SessionBody,
} from '@devsync/sdk';
import type { Logger } from '@devsync/config';
import type { Outbox } from '../queue/outbox';

interface LocalSession {
  info: SessionBody;
  serverId?: string;
  state: HeartbeatBody;
  ending?: boolean;
}

export const HEARTBEAT_INTERVAL_MS = 30_000;

const isRetryable = (error: unknown) =>
  !(error instanceof DevSyncApiError) ||
  error.status >= 500 ||
  error.status === 429 ||
  error.status === 408;

/**
 * Local Claude Code sessions of this machine. Registration and heartbeats are retried by `tick()`;
 * activities and session ends go through the persistent outbox so nothing is lost while offline.
 */
export class SessionManager {
  private readonly sessions = new Map<string, LocalSession>();
  private onUnauthorized: () => void = () => {};

  constructor(
    private readonly api: DevSyncClient,
    private readonly outbox: Outbox,
    private readonly logger: Logger,
  ) {}

  onTokenRejected(handler: () => void) {
    this.onUnauthorized = handler;
  }

  list() {
    return [...this.sessions.entries()].map(([key, s]) => ({
      externalSessionId: key,
      registered: !!s.serverId,
      ...s.state,
    }));
  }

  async start(info: SessionBody) {
    const existing = this.sessions.get(info.externalSessionId);
    this.sessions.set(info.externalSessionId, {
      info,
      state: existing?.state ?? {},
      ...(existing?.serverId ? { serverId: existing.serverId } : {}),
    });
    await this.register(info.externalSessionId);
    return { registered: !!this.sessions.get(info.externalSessionId)?.serverId };
  }

  async update(externalSessionId: string, state: HeartbeatBody) {
    const session = this.sessions.get(externalSessionId);
    if (!session) throw new Error(`Unknown session ${externalSessionId}`);
    session.state = { ...session.state, ...state };
    await this.sendHeartbeat(externalSessionId);
  }

  async activity(
    externalSessionId: string,
    body: { kind: string; summary: string; tool?: string },
  ) {
    if (!this.sessions.has(externalSessionId))
      throw new Error(`Unknown session ${externalSessionId}`);
    await this.outbox.enqueue('activity', externalSessionId, { ...body, id: randomUUID() });
    await this.flush();
  }

  async end(externalSessionId: string) {
    const session = this.sessions.get(externalSessionId);
    if (!session) return;
    session.ending = true;
    await this.outbox.enqueue('end', externalSessionId, {});
    await this.flush();
  }

  /** Periodic work: register pending sessions, heartbeat registered ones, drain the outbox. */
  async tick() {
    for (const [key, session] of this.sessions) {
      if (session.ending) continue;
      if (!session.serverId) await this.register(key);
      else await this.sendHeartbeat(key);
    }
    await this.flush();
  }

  async flush() {
    for (const item of this.outbox.due()) {
      const session = this.sessions.get(item.sessionKey);
      if (!session?.serverId) {
        if (!session) await this.outbox.complete(item.id); // daemon restarted: the session is gone
        continue;
      }
      try {
        if (item.kind === 'activity') {
          await this.api.publishActivity({
            ...(item.body as { kind: 'tool_used'; summary: string }),
            sessionId: session.serverId,
          });
        } else {
          await this.api.endSession(session.serverId).catch((error: unknown) => {
            if (!(error instanceof DevSyncApiError && error.status === 404)) throw error; // already ended
          });
          this.sessions.delete(item.sessionKey);
        }
        await this.outbox.complete(item.id);
      } catch (error) {
        if (this.handleAuth(error)) return;
        if (isRetryable(error)) {
          await this.outbox.retryLater(item.id);
          return; // keep FIFO order: stop at the first failure
        }
        this.logger.warn({ err: error, kind: item.kind }, 'dropping rejected outbox item');
        await this.outbox.complete(item.id);
      }
    }
  }

  private async register(key: string) {
    const session = this.sessions.get(key);
    if (!session) return;
    try {
      const result = await this.api.registerSession(session.info);
      session.serverId = result.sessionId;
      if (Object.keys(session.state).length) await this.sendHeartbeat(key);
    } catch (error) {
      if (!this.handleAuth(error))
        this.logger.debug({ err: error }, 'session registration deferred');
    }
  }

  private async sendHeartbeat(key: string) {
    const session = this.sessions.get(key);
    if (!session?.serverId) return;
    try {
      await this.api.heartbeat(session.serverId, session.state);
    } catch (error) {
      if (this.handleAuth(error)) return;
      if (error instanceof DevSyncApiError && error.status === 404) {
        delete session.serverId; // closed server-side (timeout): register again
        await this.register(key);
      }
    }
  }

  private handleAuth(error: unknown): boolean {
    if (error instanceof DevSyncApiError && error.status === 401) {
      this.onUnauthorized();
      return true;
    }
    return false;
  }
}
