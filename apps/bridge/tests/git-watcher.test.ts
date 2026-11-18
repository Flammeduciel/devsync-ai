import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@devsync/config';
import type { DevSyncClient } from '@devsync/sdk';
import { describe, expect, it } from 'vitest';
import { GitWatcher } from '../src/git/watcher';

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8' });
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

describe('GitWatcher', () => {
  it('sends changed snapshots only and reports merge-tree conflicts the server asks about', async () => {
    const origin = await mkdtemp(join(tmpdir(), 'ds-o-'));
    git(origin, 'init', '-q', '--bare', '-b', 'main');
    const dir = await mkdtemp(join(tmpdir(), 'ds-w-'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', origin);
    await writeFile(join(dir, 'pay.ts'), lines(50));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'init');
    git(dir, 'push', '-q', 'origin', 'main');
    // Another agent's branch, pushed: changes line 20.
    git(dir, 'checkout', '-qb', 'feat/other');
    await writeFile(join(dir, 'pay.ts'), lines(50).replace('line 20\n', 'other 20\n'));
    git(dir, 'commit', '-qam', 'other');
    git(dir, 'push', '-q', 'origin', 'feat/other');
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'checkout', '-qb', 'feat/mine');
    await writeFile(join(dir, 'pay.ts'), lines(50).replace('line 20\n', 'mine 20\n'));
    git(dir, 'commit', '-qam', 'mine');

    const sent: Record<string, unknown>[] = [];
    const checks: Record<string, unknown>[] = [];
    const api = {
      reportGitSnapshot: async (body: Record<string, unknown>) => {
        sent.push(body);
        return { tracked: true, repositoryId: 'r1', conflicts: [], mergeChecks: [{ otherAgentId: 'a2', otherBranch: 'feat/other', files: ['pay.ts'] }] };
      },
      reportMergeCheck: async (body: Record<string, unknown>) => void checks.push(body),
    } as unknown as DevSyncClient;
    const watcher = new GitWatcher(api, createLogger('test', { level: 'silent' }), { fetchForChecks: false });

    await watcher.tick([{ externalSessionId: 's1', workingDirectory: dir }]);
    await watcher.tick([{ externalSessionId: 's1', workingDirectory: dir }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ branch: 'feat/mine', externalSessionId: 's1', changedHunks: { 'pay.ts': [[20, 20]] } });
    expect(checks).toEqual([{ repositoryId: 'r1', otherAgentId: 'a2', otherBranch: 'feat/other', conflictingFiles: ['pay.ts'] }]);

    await writeFile(join(dir, 'notes.md'), 'x');
    await watcher.tick([{ externalSessionId: 's1', workingDirectory: dir }]);
    expect(sent).toHaveLength(2);
    expect(checks).toHaveLength(1); // same verdict is not re-reported
  });
});
