import { createServer, type Server as HttpServer } from 'node:http';
import type { Logger } from '@devsync/config';
import { isAppError } from '@devsync/shared';
import { Server } from 'socket.io';
import { parseHandshake } from './auth/handshake';

export interface RealtimeServer {
  http: HttpServer;
  io: Server;
  close: () => Promise<void>;
}

export interface RealtimeServerOptions {
  corsOrigin: string;
  logger: Logger;
  /** Resolves the authenticated identity for a token. Until Phase 2 wires it, every connection is refused. */
  authenticate?: (token: string) => Promise<{ userId: string; teamIds: string[] } | null>;
}

export function createRealtimeServer(options: RealtimeServerOptions): RealtimeServer {
  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404).end();
  });

  const io = new Server(http, {
    cors: { origin: options.corsOrigin, credentials: true },
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
    maxHttpBufferSize: 1_000_000,
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
      socket.data.handshake = handshake;
      next();
    } catch (error) {
      next(new Error(isAppError(error) ? error.code : 'INTERNAL'));
    }
  });

  return {
    http,
    io,
    close: () => new Promise((resolve) => io.close(() => resolve())),
  };
}
