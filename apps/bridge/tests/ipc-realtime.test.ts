import { mkdtemp } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@devsync/config';
import { channels, type Envelope } from '@devsync/protocol';
import { Server } from 'socket.io';
import { describe, expect, it } from 'vitest';
import { createRealtimeLink } from '../src/connection/realtime-link';
import { ipcCall, startIpcServer } from '../src/daemon/ipc';
import { DeliveryState } from '../src/queue/state';

const logger = createLogger('test', { level: 'silent' });
const tmp = () => mkdtemp(join(tmpdir(), 'ds-'));

describe('IPC', () => {
  it('round-trips requests, reports handler errors and is owner-only', async () => {
    const path = join(await tmp(), 'b.sock');
    const server = await startIpcServer(path, {
      echo: async (p) => p,
      fail: async () => {
        throw new Error('nope');
      },
    });
    await expect(ipcCall(path, 'echo', { a: 1 })).resolves.toEqual({ a: 1 });
    await expect(ipcCall(path, 'fail')).rejects.toThrow('nope');
    await expect(ipcCall(path, 'missing')).rejects.toThrow('Unknown method');
    if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
    server.close();
    await expect(ipcCall(path, 'echo')).rejects.toThrow('not running');
  });
});

describe('realtime link', () => {
  it('sends the last sequence on reconnect, dedupes and acks deliveries', async () => {
    const http = createServer();
    const io = new Server(http);
    const handshakes: unknown[] = [];
    const acks: unknown[] = [];
    const event = (id: string, sequence: number): Envelope => ({
      id,
      type: 'agent.status.updated',
      version: '1.0',
      timestamp: new Date().toISOString(),
      teamId: 't1',
      actor: { type: 'SYSTEM' },
      sequence,
      payload: {},
    });
    io.on('connection', async (socket) => {
      handshakes.push(socket.handshake.auth.lastSequence);
      if (handshakes.length === 1) {
        for (const e of [event('e1', 10), event('e1', 10), event('e2', 11)])
          acks.push(await socket.emitWithAck(channels.deliver, e));
        socket.disconnect(true); // simulates a gateway restart
      }
    });
    await new Promise<void>((r) => http.listen(0, r));
    const url = `http://localhost:${(http.address() as AddressInfo).port}`;

    const state = await DeliveryState.load(join(await tmp(), 'state.json'));
    const received: string[] = [];
    const link = createRealtimeLink({
      url,
      token: 'dsd_x',
      state,
      logger,
      onEvent: (e) => void received.push(e.id),
      onUnauthorized: () => {},
    });
    await new Promise((r) => setTimeout(r, 2500));
    link.close();
    io.close();

    expect(received).toEqual(['e1', 'e2']);
    expect(acks).toMatchObject([{ duplicate: false }, { duplicate: true }, { duplicate: false }]);
    expect(handshakes[0]).toEqual({});
    expect(handshakes[1]).toEqual({ t1: 11 });
  });
});
