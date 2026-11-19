import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { compactRanges, parsePorcelainStatus, parseZeroContextDiff, type LineRange } from './diff';

const run = promisify(execFile);
const MAX_FILES = 500;

async function git(cwd: string, args: string[], timeout = 5000): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['-C', cwd, ...args], {
      timeout,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch {
    return null;
  }
}

export interface GitSnapshot {
  remote: string;
  worktreePath: string;
  isLinkedWorktree: boolean;
  branch: string;
  head: string;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  baseRef: string | null;
  mergeBase: string | null;
  aheadBy: number;
  behindBy: number;
  modifiedFiles: string[];
  stagedFiles: string[];
  untrackedFiles: string[];
  unmergedFiles: string[];
  /** Ranges of the merge-base version touched by this worktree (commits since merge-base + uncommitted). */
  changedHunks: Record<string, LineRange[]>;
  /** Hash of the observable state: unchanged snapshots are not re-sent. */
  fingerprint: string;
}

/** The repository's main branch as known locally: origin/HEAD, else origin/main|master, else main|master. */
async function baseRef(cwd: string): Promise<string | null> {
  const originHead = (
    await git(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  )?.trim();
  if (originHead) return originHead;
  for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
    if ((await git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]))?.trim())
      return ref;
  }
  return null;
}

/**
 * Observes a working tree without modifying it (read-only git commands). Only paths, line numbers and
 * commit metadata are collected — never file contents.
 */
export async function takeSnapshot(cwd: string): Promise<GitSnapshot | null> {
  const root = (await git(cwd, ['rev-parse', '--show-toplevel']))?.trim();
  if (!root) return null;
  const [remote, branch, head, gitDir, commonDir, log, status] = await Promise.all([
    git(root, ['remote', 'get-url', 'origin']),
    git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(root, ['rev-parse', 'HEAD']),
    git(root, ['rev-parse', '--absolute-git-dir']),
    git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
    git(root, ['log', '-1', '--format=%H%x00%s']),
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
  ]);
  if (!remote?.trim() || !head?.trim()) return null; // no origin or no commit yet: nothing to compare

  const base = await baseRef(root);
  const mergeBase = base ? (await git(root, ['merge-base', 'HEAD', base]))?.trim() || null : null;
  const counts = base
    ? (await git(root, ['rev-list', '--left-right', '--count', `${base}...HEAD`]))
        ?.trim()
        .split(/\s+/)
    : null;
  // Diff of the working tree against the merge-base: committed and uncommitted changes of this branch.
  const diff = await git(
    root,
    ['diff', '-U0', '--no-color', '--no-ext-diff', mergeBase ?? 'HEAD'],
    10_000,
  );
  const hunks = parseZeroContextDiff(diff ?? '');
  const st = parsePorcelainStatus(status ?? '');
  for (const path of st.untracked) hunks[path] ??= [[1, 1]]; // new file: any change on the same path overlaps

  const changedHunks: Record<string, LineRange[]> = {};
  for (const path of Object.keys(hunks).sort().slice(0, MAX_FILES))
    changedHunks[path] = compactRanges(hunks[path]!);
  const [lastSha, ...subject] = (log ?? '').trim().split('\0');
  const snapshot: Omit<GitSnapshot, 'fingerprint'> = {
    remote: remote.trim(),
    worktreePath: root,
    isLinkedWorktree: !!gitDir && !!commonDir && gitDir.trim() !== commonDir.trim(),
    branch: branch?.trim() || 'HEAD',
    head: head.trim(),
    lastCommitSha: lastSha || null,
    lastCommitMessage: subject.join(' ').slice(0, 200) || null,
    baseRef: base,
    mergeBase,
    behindBy: Number(counts?.[0] ?? 0),
    aheadBy: Number(counts?.[1] ?? 0),
    modifiedFiles: st.modified.slice(0, MAX_FILES),
    stagedFiles: st.staged.slice(0, MAX_FILES),
    untrackedFiles: st.untracked.slice(0, MAX_FILES),
    unmergedFiles: st.unmerged.slice(0, MAX_FILES),
    changedHunks,
  };
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ ...snapshot, lastCommitMessage: null }))
    .digest('hex');
  return { ...snapshot, fingerprint };
}

/**
 * Would merging `otherRef` into HEAD conflict? Uses `git merge-tree --write-tree` (Git ≥ 2.38), which
 * computes the merge in memory without touching the working tree, index or refs.
 */
export async function mergeTreeConflicts(cwd: string, otherRef: string): Promise<string[] | null> {
  if (!(await git(cwd, ['rev-parse', '--verify', '--quiet', `${otherRef}^{commit}`]))?.trim())
    return null;
  try {
    await run(
      'git',
      ['-C', cwd, 'merge-tree', '--write-tree', '--name-only', '--no-messages', 'HEAD', otherRef],
      { timeout: 10_000, windowsHide: true },
    );
    return []; // exit 0: clean merge
  } catch (error) {
    const e = error as { code?: number; stdout?: string };
    if (e.code !== 1 || typeof e.stdout !== 'string') return null; // not a conflict result (missing ref, old git…)
    // stdout: tree OID, then the conflicted paths (one per line).
    return e.stdout
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean);
  }
}
