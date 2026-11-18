'use client';

import { channels, PROTOCOL_VERSION, type Envelope } from '@devsync/protocol';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

async function fetchToken(): Promise<{ token: string; url: string }> {
  const response = await fetch('/api/v1/realtime/token', { cache: 'no-store' });
  if (!response.ok) throw new Error('Cannot get a realtime token');
  return response.json();
}

/**
 * Subscribes the dashboard to its teams' events. A fresh short-lived token is fetched for every
 * (re)connection; events received while offline are refetched by the caller (query invalidation).
 */
export function useRealtime(onEvent: (event: Envelope) => void): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let cancelled = false;
    let socket: ReturnType<typeof io> | undefined;
    void fetchToken()
      .then(({ url }) => {
        if (cancelled) return;
        socket = io(url, {
          transports: ['websocket'],
          reconnectionDelayMax: 15_000,
          auth: (cb) => {
            void fetchToken()
              .then(({ token }) => cb({ token, clientKind: 'dashboard', protocolVersion: PROTOCOL_VERSION, clientVersion: 'web' }))
              .catch(() => cb({}));
          },
        });
        socket.on('connect', () => setStatus('live'));
        socket.on('disconnect', () => setStatus('offline'));
        socket.on('connect_error', () => setStatus('offline'));
        socket.on(channels.deliver, (event: Envelope) => handler.current(event));
      })
      .catch(() => setStatus('offline'));
    return () => {
      cancelled = true;
      socket?.close();
    };
  }, []);

  return status;
}
