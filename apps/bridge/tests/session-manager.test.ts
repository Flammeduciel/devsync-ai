import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@devsync/config';
import { DevSyncApiError, type DevSyncClient } from '@devsync/sdk';
import { describe, expect, it } from 'vitest';
import { notificationCommands } from '../src/notifications/notifier';
import { Outbox } from '../src/queue/outbox';
import { SessionManager } from '../src/sessions/session-manager';

const logger = createLogger('test', { level: 'silent' });

function fakeApi() {
  const calls: string[] = [];
  let online = true;
  const guard = () => {
    if (!online) throw new TypeError('fetch failed');
  };
  const api = {
    registerSession: async (b: { externalSessionId: string }) => (
      guard(),
      calls.push(`register:${b.externalSessionId}`),
      { agentId: 'a', sessionId: `srv-${b.externalSessionId}`, projectId: null }
    ),
    heartbeat: async (id: string, b: object) => (
      guard(),
      calls.push(`heartbeat:${id}:${JSON.stringify(b)}`),
      { status: 'ONLINE' }
    ),
    publishActivity: async (b: { summary: string; id?: string }) => (
      guard(),
      calls.push(`activity:${b.summary}`),
      { duplicate: false }
    ),
    endSession: async (id: string) => (guard(), void calls.push(`end:${id}`)),
  } as unknown as DevSyncClient;
  return { api, calls, setOnline: (v: boolean) => (online = v) };
}

async function setup() {
  const fake = fakeApi();
  const outbox = await new Outbox(
    join(await mkdtemp(join(tmpdir(), 'devsync-sm-')), 'outbox.json'),
    () => 0,
  ).load();
  return { ...fake, outbox, manager: new SessionManager(fake.api, outbox, logger) };
}

describe('SessionManager', () => {
  it('registers, heartbeats with declared state, publishes activities and ends', async () => {
    const { manager, calls } = await setup();
    await manager.start({ externalSessionId: 'c1' });
    await manager.update('c1', { status: 'WORKING', currentTask: 'Payment form' });
    await manager.activity('c1', { kind: 'tool_used', summary: 'Edited a.ts', tool: 'Edit' });
    await manager.end('c1');
    expect(calls).toEqual([
      'register:c1',
      'heartbeat:srv-c1:{"status":"WORKING","currentTask":"Payment form"}',
      'activity:Edited a.ts',
      'end:srv-c1',
    ]);
    expect(manager.list()).toEqual([]);
  });

  it('keeps work queued while offline and replays it in order', async () => {
    const { manager, calls, setOnline, outbox } = await setup();
    setOnline(false);
    await expect(manager.start({ externalSessionId: 'c2' })).resolves.toEqual({
      registered: false,
    });
    await manager.activity('c2', { kind: 'tool_used', summary: 'first' });
    await manager.activity('c2', { kind: 'tool_used', summary: 'second' });
    expect(outbox.size).toBe(2);
    setOnline(true);
    await manager.tick();
    expect(calls).toEqual(['register:c2', 'activity:first', 'activity:second']);
    expect(outbox.size).toBe(0);
  });

  it('signals a revoked token', async () => {
    const { manager, api } = await setup();
    (api as unknown as { registerSession: () => never }).registerSession = () => {
      throw new DevSyncApiError(401, 'UNAUTHENTICATED', 'revoked');
    };
    let rejected = false;
    manager.onTokenRejected(() => (rejected = true));
    await manager.start({ externalSessionId: 'c3' });
    expect(rejected).toBe(true);
  });
});

describe('notificationCommands', () => {
  it('escapes AppleScript strings and never uses a shell', () => {
    const [[file, args]] = notificationCommands(
      { title: 'Deliverable "ready"', body: 'a\\b"; do shell script "rm -rf ~"', sound: false },
      'darwin',
    ) as [[string, string[]]];
    expect(file).toBe('osascript');
    expect(args[1]).toBe(
      'display notification "a\\\\b\\"; do shell script \\"rm -rf ~\\"" with title "Deliverable \\"ready\\""',
    );
  });
  it('plays a sound only when asked', () => {
    expect(notificationCommands({ title: 't', sound: true }, 'darwin')).toHaveLength(2);
    expect(notificationCommands({ title: 't', sound: false }, 'linux')).toHaveLength(1);
  });
});
