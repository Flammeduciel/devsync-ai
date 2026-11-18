import type { Logger } from '@devsync/config';
import { channels, PROTOCOL_VERSION, type Envelope } from '@devsync/protocol';
import { io, type Socket } from 'socket.io-client';
import type { DeliveryState } from '../queue/state';
import { BRIDGE_VERSION } from '../version';

export interface RealtimeLinkOptions {
  url: string;
  token: string;
  state: DeliveryState;
  logger: Logger;
  onEvent: (event: Envelope) => void | Promise<void>;
  /** Device token refused: the machine was revoked or the member left the team. */
  onUnauthorized: () => void;
}

export type LinkStatus = 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

/**
 * Socket.IO link to the gateway. Reconnects with exponential backoff; every (re)connection sends the
 * last processed sequence per team so the gateway replays what was missed. Duplicates are dropped by id.
 */
export function createRealtimeLink(options: RealtimeLinkOptions) {
  let status: LinkStatus = 'connecting';
  const socket: Socket = io(options.url, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    randomizationFactor: 0.5,
    // Evaluated on every attempt: always carries the latest sequences.
    auth: (cb) =>
      cb({
        token: options.token,
        clientKind: 'bridge',
        protocolVersion: PROTOCOL_VERSION,
        clientVersion: BRIDGE_VERSION,
        lastSequence: options.state.lastSequence,
      }),
  });

  socket.on('connect', () => {
    status = 'connected';
    options.logger.info('connected to realtime gateway');
  });
  socket.on('disconnect', (reason) => {
    status = 'disconnected';
    options.logger.warn({ reason }, 'disconnected from realtime gateway');
    // A server-side disconnect (revocation) is not retried automatically by Socket.IO: try once
    // more so a revoked token surfaces as UNAUTHENTICATED, while a gateway restart reconnects.
    if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 1000);
  });
  socket.on('connect_error', (error) => {
    if (error.message === 'UNAUTHENTICATED') {
      status = 'unauthorized';
      socket.disconnect();
      options.onUnauthorized();
      return;
    }
    status = 'disconnected';
    options.logger.debug({ err: error.message }, 'realtime connection failed, retrying');
  });

  socket.on(channels.deliver, async (event: Envelope, ack?: (r: unknown) => void) => {
    const fresh = options.state.accept(event);
    if (fresh) {
      try {
        await options.onEvent(event);
      } catch (error) {
        options.logger.error({ err: error, type: event.type }, 'event handler failed');
      }
    }
    ack?.({ ok: true, id: event.id, duplicate: !fresh });
  });

  return {
    get status() {
      return status;
    },
    close: () => {
      socket.close();
    },
  };
}
export type RealtimeLink = ReturnType<typeof createRealtimeLink>;
