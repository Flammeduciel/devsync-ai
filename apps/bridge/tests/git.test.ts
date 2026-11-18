import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compactRanges, parsePorcelainStatus, parseZeroContextDiff } from '../src/git/diff';
import { mergeTreeConflicts, takeSnapshot } from '../src/git/snapshot';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    encoding: 'utf8',
  });
const lines = (n: number, tag = 'line') =>
  Array.from({ length: n }, (_, i) => `${tag} ${i + 1}`).join('\n') + '\n';

async function repo() {
  const origin = await mkdtemp(join(tmpdir(), 'ds-origin-'));
  git(origin, 'init', '-q', '--bare', '-b', 'main');
  const dir = await mkdtemp(join(tmpdir(), 'ds-clone-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'remote', 'add', 'origin', origin);
  await writeFile(join(dir, 'payment.ts'), lines(100));
  await writeFile(join(dir, 'cart.ts'), lines(20));
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  git(dir, 'push', '-q', 'origin', 'main');
  git(dir, 'fetch', '-q', 'origin');
  return { origin, dir };
}

describe('diff parsing', () => {
  it('maps hunks to base line ranges, including pure insertions and deletions', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,3 +10,4 @@ x',
      '@@ -40,0 +42,2 @@ y',
      '@@ -55 +57 @@ z',
      'diff --git a/old.ts b/old.ts',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1,5 +0,0 @@',
    ].join('\n');
    expect(parseZeroContextDiff(diff)).toEqual({
      'src/a.ts': [
        [10, 12],
        [40, 40],
        [55, 55],
      ],
      'old.ts': [[1, 5]],
    });
  });
  it('compacts ranges', () => {
    expect(
      compactRanges([
        [5, 6],
        [1, 2],
        [3, 3],
        [4, 4],
        [10, 12],
      ]),
    ).toEqual([
      [1, 6],
      [10, 12],
    ]);
    expect(
      compactRanges([
        [1, 2],
        [5, 6],
      ]),
    ).toEqual([
      [1, 2],
      [5, 6],
    ]);
    expect(
      compactRanges(
        [
          [1, 1],
          [5, 5],
          [9, 9],
        ],
        2,
      ),
    ).toEqual([[1, 9]]);
  });
  it('parses porcelain status with renames and conflicts', () => {
    const out = [
      'M  staged.ts',
      ' M dirty.ts',
      'MM both.ts',
      '?? new.ts',
      'UU conflict.ts',
      'R  renamed.ts',
      'original.ts',
      '',
    ].join('\0');
    expect(parsePorcelainStatus(out)).toEqual({
      staged: ['staged.ts', 'both.ts', 'renamed.ts'],
      modified: ['dirty.ts', 'both.ts'],
      untracked: ['new.ts'],
      unmerged: ['conflict.ts'],
    });
  });
});

describe('takeSnapshot (real repositories)', () => {
  it('reports branch, changed base ranges (committed + uncommitted) and untracked files', async () => {
    const { dir } = await repo();
    git(dir, 'checkout', '-qb', 'feat/refund');
    await writeFile(join(dir, 'payment.ts'), lines(100).replace('line 30\n', 'refund 30\n'));
    git(dir, 'commit', '-qam', 'refund');
    await writeFile(
      join(dir, 'payment.ts'),
      lines(100).replace('line 30\n', 'refund 30\n').replace('line 70\n', 'refund 70\n'),
    );
    await writeFile(join(dir, 'notes.md'), 'x');
    const s = (await takeSnapshot(join(dir)))!;
    expect(s).toMatchObject({
      branch: 'feat/refund',
      baseRef: 'origin/main',
      aheadBy: 1,
      behindBy: 0,
      isLinkedWorktree: false,
      modifiedFiles: ['payment.ts'],
      untrackedFiles: ['notes.md'],
    });
    expect(s.changedHunks).toEqual({
      'notes.md': [[1, 1]],
      'payment.ts': [
        [30, 30],
        [70, 70],
      ],
    });
    expect(s.lastCommitMessage).toBe('refund');
    expect((await takeSnapshot(dir))!.fingerprint).toBe(s.fingerprint);
  });

  it('detects linked worktrees and returns null outside a repository', async () => {
    const { dir } = await repo();
    const wt = join(await mkdtemp(join(tmpdir(), 'ds-wt-')), 'feature');
    git(dir, 'worktree', 'add', '-q', '-b', 'feat/wt', wt);
    expect((await takeSnapshot(wt))!).toMatchObject({ isLinkedWorktree: true, branch: 'feat/wt' });
    expect(await takeSnapshot(await mkdtemp(join(tmpdir(), 'ds-none-')))).toBeNull();
  });

  it('predicts merge conflicts in memory without touching the working tree', async () => {
    const { dir } = await repo();
    git(dir, 'checkout', '-qb', 'alice');
    await writeFile(join(dir, 'payment.ts'), lines(100).replace('line 50\n', 'alice 50\n'));
    git(dir, 'commit', '-qam', 'alice');
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'checkout', '-qb', 'bob');
    await writeFile(join(dir, 'payment.ts'), lines(100).replace('line 50\n', 'bob 50\n'));
    git(dir, 'commit', '-qam', 'bob');
    await writeFile(join(dir, 'cart.ts'), 'uncommitted');
    expect(await mergeTreeConflicts(dir, 'alice')).toEqual(['payment.ts']);
    expect(git(dir, 'status', '--porcelain')).toBe(' M cart.ts\n'); // untouched
    git(dir, 'checkout', '-q', 'cart.ts');
    git(dir, 'checkout', '-qb', 'carol', 'main');
    await writeFile(join(dir, 'cart.ts'), lines(20).replace('line 2\n', 'carol 2\n'));
    git(dir, 'commit', '-qam', 'carol');
    expect(await mergeTreeConflicts(dir, 'alice')).toEqual([]);
    expect(await mergeTreeConflicts(dir, 'does-not-exist')).toBeNull();
  });
});
