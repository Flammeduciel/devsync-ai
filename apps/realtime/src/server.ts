import { createServer, type Server as HttpServer } from 'node:http';
import type { Logger } from '@devsync/config';
import { channels, type ControlMessage } from '@devsync/protocol';
import { isAppError } from '@devsync/shared';
import { Server, type Socket } from 'socket.io';
import { parseHandshake } from './auth/handshake';
import type { Authenticate, Identity } from './auth/identity';
import { canReceive, REPLAY_LIMIT, REPLAY_OVERLAP, toClient } from './events/delivery';
import type { EventStore, StoredEvent } from './events/event-store';
import { roomFor } from './gateways/rooms';
import type { Presence } from './presence/presence';

export interface RealtimeServer {
  http: HttpServer;
  io: Server;
  /** Fans out a committed event (from the Redis events channel) to the sockets allowed to see it. */
  ingest: (event: StoredEvent) => void;
  /** Applies a control message (from the Redis control channel). */
  control: (message: ControlMessage) => Promise<void>;
  close: () => Promise<void>;
}

export interface RealtimeServerOptions {
  corsOrigin: string;
  logger: Logger;
  /** Resolves the identity behind a token. Without it every connection is refused. */
  authenticate?: Authenticate;
  eventStore?: EventStore;
  presence?: Presence;
  presenceRefreshMs?: number;
}

type SocketData = { identity: Identity };

const resumeSchemaGuard = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] >= 0,
    ),
  );
};

export function createRealtimeServer(options: RealtimeServerOptions): RealtimeServer {
  const { logger } = options;
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });

  const io = new Server<Record<string, never>, Record<string, never>, Record<string, never>, SocketData>(http, {
    cors: { origin: options.corsOrigin, credentials: true },
    maxHttpBufferSize: 1_000_000,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const handshake = parseHandshake(socket.handshake.auth);
      const identity = options.authenticate ? await options.authenticate(handshake.token) : null;
      if (!identity) {
        next(new Error('UNAUTHENTICATED'));
        return;
      }
      socket.data.identity = identity;
      next();
    } catch (error) {
      next(new Error(isAppError(error) ? error.code : 'INTERNAL'));
    }
  });

  async function replay(socket: Socket, lastSequence: Record<string, number>) {
    const { identity } = socket.data as SocketData;
    if (!options.eventStore) return { replayed: 0, hasMore: false };
    let replayed = 0;
    let hasMore = false;
    for (const teamId of identity.teamIds) {
      const from = Math.max(0, (lastSequence[teamId] ?? 0) - REPLAY_OVERLAP);
      if (lastSequence[teamId] === undefined) continue; // new client: nothing to catch up on
      const events = await options.eventStore.since(teamId, from, REPLAY_LIMIT);
      hasMore ||= events.length === REPLAY_LIMIT;
      for (const event of events) {
        if (!canReceive(event, identity.userId, identity.teamIds)) continue;
        socket.emit(channels.deliver, toClient(event));
        replayed += 1;
      }
    }
    return { replayed, hasMore };
  }

  io.on('connection', async (socket) => {
    const { identity } = socket.data as SocketData;
    for (const teamId of identity.teamIds) {
      await socket.join([roomFor.team(teamId), roomFor.member(teamId, identity.userId)]);
    }
    let presenceTimer: NodeJS.Timeout | undefined;
    if (identity.kind === 'bridge') {
      await socket.join(roomFor.machine(identity.machineId));
      await options.presence?.connect(identity.machineId);
      presenceTimer = setInterval(() => void options.presence?.refresh(identity.machineId), options.presenceRefreshMs ?? 30_000);
    }
    logger.info({ kind: identity.kind, userId: identity.userId, socket: socket.id }, 'client connected');

    socket.on(channels.resume, async (raw: unknown, ack?: (result: unknown) => void) => {
      try {
        const result = await replay(socket, resumeSchemaGuard((raw as { lastSequence?: unknown })?.lastSequence));
        ack?.({ ok: true, ...result });
      } catch (error) {
        logger.error({ err: error }, 'replay failed');
        ack?.({ ok: false, code: 'INTERNAL', message: 'Replay failed', retryable: true });
      }
    });

    socket.on('disconnect', (reason) => {
      clearInterval(presenceTimer);
      if (identity.kind === 'bridge') void options.presence?.disconnect(identity.machineId);
      logger.info({ kind: identity.kind, userId: identity.userId, reason }, 'client disconnected');
    });

    // Catch up on what happened while the client was away (sequence sent in the handshake).
    const lastSequence = resumeSchemaGuard((socket.handshake.auth as { lastSequence?: unknown }).lastSequence);
    if (Object.keys(lastSequence).length) await replay(socket, lastSequence).catch((error) => logger.error({ err: error }, 'replay failed'));
  });

  function ingest(event: StoredEvent) {
    const target = event.audience?.length
      ? io.to(event.audience.map((userId) => roomFor.member(event.teamId, userId)))
      : io.to(roomFor.team(event.teamId));
    target.emit(channels.deliver, toClient(event));
  }

  async function control(message: ControlMessage) {
    if (message.type === 'machine.revoked') {
      io.in(roomFor.machine(message.machineId)).disconnectSockets(true);
      logger.info({ machineId: message.machineId }, 'revoked machine disconnected');
    }
  }

  return {
    http,
    io,
    ingest,
    control,
    close: () => new Promise((resolve) => io.close(() => resolve())),
  };
}
