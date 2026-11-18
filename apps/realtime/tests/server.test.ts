import type { AddressInfo } from 'node:net';
import { createLogger } from '@devsync/config';
import { PROTOCOL_VERSION } from '@devsync/protocol';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import { createRealtimeServer, type RealtimeServer } from '../src/server';

const logger = createLogger('test', { level: 'silent' });
let server: RealtimeServer | undefined;
let client: Socket | undefined;

afterEach(async () => {
  client?.close();
  await server?.close();
});

async function start(authenticate?: Parameters<typeof createRealtimeServer>[0]['authenticate']) {
  server = createRealtimeServer({ corsOrigin: '*', logger, ...(authenticate ? { authenticate } : {}) });
  await new Promise<void>((resolve) => server!.http.listen(0, resolve));
  return `http://localhost:${(server.http.address() as AddressInfo).port}`;
}

function connectError(url: string, auth: object): Promise<string> {
  client = connect(url, { auth, transports: ['websocket'], reconnection: false });
  return new Promise((resolve, reject) => {
    client!.on('connect_error', (e) => resolve(e.message));
    client!.on('connect', () => reject(new Error('unexpectedly connected')));
  });
}

const validAuth = {
  token: 'x'.repeat(32),
  clientKind: 'bridge',
  protocolVersion: PROTOCOL_VERSION,
  clientVersion: '0.0.0',
};

describe('realtime gateway', () => {
  it('serves /health', async () => {
    const url = await start();
    await expect(fetch(`${url}/health`).then((r) => r.json())).resolves.toEqual({ status: 'ok' });
  });

  it('rejects malformed handshakes', async () => {
    const url = await start();
    await expect(connectError(url, { token: 'short' })).resolves.toBe('BAD_REQUEST');
  });

  it('rejects incompatible protocol versions', async () => {
    const url = await start(async () => ({ userId: 'u', teamIds: [] }));
    await expect(connectError(url, { ...validAuth, protocolVersion: '99.0' })).resolves.toBe('BAD_REQUEST');
  });

  it('refuses every connection while no authenticator is configured', async () => {
    const url = await start();
    await expect(connectError(url, validAuth)).resolves.toBe('UNAUTHENTICATED');
  });

  it('accepts a connection once the token is authenticated', async () => {
    const url = await start(async (token) => (token === validAuth.token ? { userId: 'u1', teamIds: [] } : null));
    client = connect(url, { auth: validAuth, transports: ['websocket'], reconnection: false });
    await expect(new Promise((resolve) => client!.on('connect', () => resolve(true)))).resolves.toBe(true);
  });
});
