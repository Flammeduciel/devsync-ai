import type { AddressInfo } from 'node:net';
import { createLogger } from '@devsync/config';
import { channels, PROTOCOL_VERSION, type Envelope } from '@devsync/protocol';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Identity } from '../src/auth/identity';
import type { EventStore, StoredEvent } from '../src/events/event-store';
import {
  createRealtimeServer,
  type RealtimeServer,
  type RealtimeServerOptions,
} from '../src/server';

const logger = createLogger('test', { level: 'silent' });
const TEAM_A = '01a1ee8d-0000-7000-8000-00000000000a';
const TEAM_B = '01a1ee8d-0000-7000-8000-00000000000b';
const ALICE = '01a1ee8d-0000-7000-8000-0000000a11ce';
const BOB = '01a1ee8d-0000-7000-8000-000000000b0b';
const MACHINE = '01a1ee8d-0000-7000-8000-00000000ac01';

const identities: Record<string, Identity> = {
  ['a'.repeat(30)]: { kind: 'dashboard', userId: ALICE, teamIds: [TEAM_A] },
  ['b'.repeat(30)]: { kind: 'dashboard', userId: BOB, teamIds: [TEAM_A, TEAM_B] },
  ['dsd_' + 'm'.repeat(30)]: {
    kind: 'bridge',
    userId: ALICE,
    teamIds: [TEAM_A],
    machineId: MACHINE,
  },
};

let server: RealtimeServer | undefined;
const clients: Socket[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
});

async function start(extra: Partial<RealtimeServerOptions> = {}) {
  server = createRealtimeServer({
    corsOrigin: '*',
    logger,
    authenticate: async (t) => identities[t] ?? null,
    ...extra,
  });
  await new Promise<void>((resolve) => server!.http.listen(0, resolve));
  return `http://localhost:${(server.http.address() as AddressInfo).port}`;
}

const auth = (token: string, extra: object = {}) => ({
  token,
  clientKind: 'dashboard',
  protocolVersion: PROTOCOL_VERSION,
  clientVersion: '0.0.0',
  ...extra,
});

function open(url: string, token: string, extra: object = {}) {
  const client = connect(url, {
    auth: auth(token, extra),
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(client);
  const received: Envelope[] = [];
  client.on(channels.deliver, (e: Envelope) => received.push(e));
  return {
    client,
    received,
    ready: new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    }),
  };
}

function connectError(url: string, authPayload: object): Promise<string> {
  const client = connect(url, {
    auth: authPayload,
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.on('connect_error', (e) => resolve(e.message));
    client.on('connect', () => reject(new Error('unexpectedly connected')));
  });
}

const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const event = (overrides: Partial<StoredEvent>): StoredEvent => ({
  id: `01a1ee8d-0000-7000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`,
  type: 'agent.status.updated',
  version: PROTOCOL_VERSION,
  timestamp: new Date().toISOString(),
  teamId: TEAM_A,
  actor: { type: 'SYSTEM' },
  sequence: 1,
  payload: {},
  ...overrides,
});

describe('handshake', () => {
  it('serves /health', async () => {
    const url = await start();
    await expect(fetch(`${url}/health`).then((r) => r.json())).resolves.toEqual({ status: 'ok' });
  });
  it('rejects malformed, incompatible and unknown tokens', async () => {
    const url = await start();
    await expect(connectError(url, { token: 'short' })).resolves.toBe('BAD_REQUEST');
    await expect(
      connectError(url, auth('a'.repeat(30), { protocolVersion: '99.0' })),
    ).resolves.toBe('BAD_REQUEST');
    await expect(connectError(url, auth('z'.repeat(30)))).resolves.toBe('UNAUTHENTICATED');
  });
  it('refuses every connection without an authenticator', async () => {
    server = createRealtimeServer({ corsOrigin: '*', logger });
    await new Promise<void>((resolve) => server!.http.listen(0, resolve));
    const url = `http://localhost:${(server.http.address() as AddressInfo).port}`;
    await expect(connectError(url, auth('a'.repeat(30)))).resolves.toBe('UNAUTHENTICATED');
  });
});

describe('fan-out', () => {
  it('delivers team events only to members of that team and strips the audience', async () => {
    const url = await start();
    const alice = open(url, 'a'.repeat(30));
    const bob = open(url, 'b'.repeat(30));
    await Promise.all([alice.ready, bob.ready]);
    server!.ingest(event({ teamId: TEAM_B, sequence: 1 }));
    server!.ingest(event({ teamId: TEAM_A, sequence: 2 }));
    server!.ingest(event({ teamId: TEAM_A, sequence: 3, audience: [BOB] }));
    await tick();
    expect(alice.received.map((e) => e.sequence)).toEqual([2]);
    expect(bob.received.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(bob.received.every((e) => !('audience' in e))).toBe(true);
  });

  it('does not leak an audience event of team A to the same user in team B only', async () => {
    const url = await start();
    const bob = open(url, 'b'.repeat(30));
    await bob.ready;
    server!.ingest(event({ teamId: TEAM_B, sequence: 9, audience: [ALICE] }));
    await tick();
    expect(bob.received).toEqual([]);
  });
});

describe('replay', () => {
  const stored = [
    event({ teamId: TEAM_A, sequence: 5 }),
    event({ teamId: TEAM_A, sequence: 6, audience: [BOB] }),
    event({ teamId: TEAM_A, sequence: 7 }),
  ];
  const store: EventStore = {
    since: async (teamId, after) =>
      stored.filter((e) => e.teamId === teamId && e.sequence! > after),
  };

  it('replays missed events from the handshake sequence, respecting the audience', async () => {
    const url = await start({ eventStore: store });
    const alice = open(url, 'a'.repeat(30), { lastSequence: { [TEAM_A]: 6 } });
    await alice.ready;
    await tick();
    expect(alice.received.map((e) => e.sequence)).toEqual([5, 7]); // overlap window re-sends 5 (clients dedupe by id); 6 is for Bob only
  });

  it('answers session:resume with an ack', async () => {
    const url = await start({ eventStore: store });
    const bob = open(url, 'b'.repeat(30));
    await bob.ready;
    const ack = await bob.client.emitWithAck(channels.resume, {
      lastSequence: { [TEAM_A]: 4, [TEAM_B]: 0, evil: 'x' },
    });
    expect(ack).toMatchObject({ ok: true, replayed: 3 });
  });
});

describe('bridges', () => {
  it('tracks presence and disconnects revoked machines', async () => {
    const calls: string[] = [];
    const presence = {
      connect: async (id: string) => void calls.push(`connect:${id}`),
      refresh: async () => {},
      disconnect: async (id: string) => void calls.push(`disconnect:${id}`),
    };
    const url = await start({ presence });
    const bridge = open(url, 'dsd_' + 'm'.repeat(30), { clientKind: 'bridge' });
    await bridge.ready;
    const disconnected = new Promise((resolve) => bridge.client.on('disconnect', resolve));
    await server!.control({ type: 'machine.revoked', machineId: MACHINE, teamId: TEAM_A });
    await expect(disconnected).resolves.toBe('io server disconnect');
    await tick();
    expect(calls).toEqual([`connect:${MACHINE}`, `disconnect:${MACHINE}`]);
  });
});
