import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bridgePaths, loadToken, saveToken } from '../src/config';
import { backoffMs, MAX_BACKOFF_MS, Outbox } from '../src/queue/outbox';
import { DeliveryState, SeenIds } from '../src/queue/state';

const tmp = () => mkdtemp(join(tmpdir(), 'devsync-bridge-'));

describe('Outbox', () => {
  it('persists items across restarts and backs off failures', async () => {
    const dir = await tmp();
    let now = 1_000_000;
    const outbox = await new Outbox(join(dir, 'outbox.json'), () => now).load();
    const first = await outbox.enqueue('activity', 's1', { summary: 'a' });
    await outbox.enqueue('end', 's1', {});
    await outbox.retryLater(first.id);
    expect(outbox.due().map((i) => i.kind)).toEqual(['end']);

    const reloaded = await new Outbox(join(dir, 'outbox.json'), () => now + 60_000).load();
    expect(reloaded.due().map((i) => i.kind)).toEqual(['activity', 'end']);
    await reloaded.complete(first.id);
    expect(reloaded.size).toBe(1);

    now += 25 * 60 * 60 * 1000;
    expect((await new Outbox(join(dir, 'outbox.json'), () => now).load()).size).toBe(0);
  });

  it('caps the exponential backoff with jitter', () => {
    expect(backoffMs(0, () => 0)).toBe(500);
    expect(backoffMs(3, () => 1)).toBe(8000);
    expect(backoffMs(30, () => 1)).toBe(MAX_BACKOFF_MS);
  });
});

describe('delivery state', () => {
  it('dedupes ids within a bounded window', () => {
    const seen = new SeenIds([], 2);
    expect(seen.add('a')).toBe(true);
    expect(seen.add('a')).toBe(false);
    seen.add('b');
    seen.add('c');
    expect(seen.add('a')).toBe(true);
  });

  it('tracks the max sequence per team and persists it', async () => {
    const file = join(await tmp(), 'state.json');
    const state = await DeliveryState.load(file);
    expect(state.accept({ id: '1', teamId: 't', sequence: 5 })).toBe(true);
    expect(state.accept({ id: '2', teamId: 't', sequence: 3 })).toBe(true);
    expect(state.accept({ id: '1', teamId: 't', sequence: 5 })).toBe(false);
    await state.flush();
    const reloaded = await DeliveryState.load(file);
    expect(reloaded.lastSequence).toEqual({ t: 5 });
    expect(reloaded.accept({ id: '2', teamId: 't' })).toBe(false);
  });
});

describe('credentials', () => {
  it('stores the device token readable by the owner only', async () => {
    const paths = bridgePaths(await tmp());
    await saveToken(paths, 'dsd_secret');
    expect(await loadToken(paths)).toBe('dsd_secret');
    if (process.platform !== 'win32')
      expect((await stat(paths.credentials)).mode & 0o777).toBe(0o600);
    expect(await readFile(paths.credentials, 'utf8')).toBe('dsd_secret');
  });
});
