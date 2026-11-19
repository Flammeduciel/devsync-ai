import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const calls: { method: string; params: Record<string, unknown> }[] = [];
let known = new Set<string>();
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ds-hook-'));
  process.env.DEVSYNC_HOME = dir;
  server = createServer((socket) => {
    socket.on('data', (chunk) => {
      const { id, method, params } = JSON.parse(chunk.toString().trim());
      calls.push({ method, params });
      let response: object = { id, result: null };
      if (method === 'session.start') known.add(params.externalSessionId);
      if (
        (method === 'session.update' || method === 'activity.publish') &&
        !known.has(params.externalSessionId)
      )
        response = { id, error: { message: `Unknown session ${params.externalSessionId}` } };
      if (method === 'git.afterEdit') {
        const overlap = {
          id: 'c1',
          kind: 'LINE_OVERLAP',
          filePath: 'src/payment.ts',
          otherOwner: 'Alice',
          otherBranch: 'feat/a',
          sharedLines: '55-60',
        };
        response = { id, result: { warnings: params.file === 'src/payment.ts' ? [overlap] : [] } };
      }
      if (method === 'api.call')
        response = {
          id,
          result: {
            team: { id: 't', name: 'Squad', slug: 's' },
            project: null,
            teammates: [],
            inbox: [],
            claims: [],
            recentActivity: [],
          },
        };
      socket.write(`${JSON.stringify(response)}\n`);
    });
  });
  await new Promise<void>((r) => server.listen(join(dir, 'bridge.sock'), r));
});
afterAll(() => server.close());

const { handleHook } = await import('../src/hook');
const base = { session_id: 's1', cwd: '/work/repo' };

describe('plugin hooks', () => {
  it('registers the session and injects the team context at SessionStart', async () => {
    const out = JSON.parse((await handleHook('SessionStart', base))!);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('# DevSync — team Squad');
    expect(out.hookSpecificOutput.additionalContext).toContain('`team_find_expert`');
    expect(out.hookSpecificOutput.additionalContext).toContain('skill `devsync:share`');
    expect(calls.map((c) => c.method)).toEqual(['session.start', 'api.call']);
  });

  it('publishes only repository-relative paths of edited files and warns about overlaps once per edit', async () => {
    calls.length = 0;
    const warned = JSON.parse(
      (await handleHook('PostToolUse', {
        ...base,
        tool_name: 'Edit',
        tool_input: { file_path: '/work/repo/src/payment.ts' },
      }))!,
    );
    await handleHook('PostToolUse', {
      ...base,
      tool_name: 'Write',
      tool_input: { file_path: '/etc/hosts' },
    });
    await handleHook('PostToolUse', { ...base, tool_name: 'Bash', tool_input: {} });
    expect(
      await handleHook('PostToolUse', {
        ...base,
        tool_name: 'Edit',
        tool_input: { file_path: '/work/repo/src/cart.ts' },
      }),
    ).toBeNull();
    expect(
      calls.filter((c) => c.method === 'activity.publish').map((c) => c.params.summary),
    ).toEqual(['Edited src/payment.ts', 'Edited src/cart.ts']);
    expect(calls.filter((c) => c.method === 'git.afterEdit').map((c) => c.params.file)).toEqual([
      'src/payment.ts',
      'src/cart.ts',
    ]);
    expect(warned.hookSpecificOutput.hookEventName).toBe('PostToolUse');
    expect(warned.hookSpecificOutput.additionalContext).toContain(
      'Alice (branch feat/a) is changing the same lines — base lines 55-60',
    );
  });

  it('maps lifecycle events to declared states and re-registers unknown sessions', async () => {
    calls.length = 0;
    known = new Set();
    await handleHook('UserPromptSubmit', base);
    await handleHook('Notification', base);
    await handleHook('Stop', base);
    await handleHook('SessionEnd', base);
    expect(calls.map((c) => `${c.method}${c.params.status ? `:${c.params.status}` : ''}`)).toEqual([
      'session.update:WORKING',
      'session.start',
      'session.update:WORKING',
      'session.update:WAITING',
      'session.update:IDLE',
      'session.end',
    ]);
  });

  it('degrades gracefully without a daemon', async () => {
    process.env.DEVSYNC_HOME = '/nonexistent';
    const out = JSON.parse((await handleHook('SessionStart', base))!);
    expect(out.hookSpecificOutput.additionalContext).toContain('not running');
  });
});
