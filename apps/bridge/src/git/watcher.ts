import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '@devsync/config';
import { DevSyncApiError, type DevSyncClient, type GitSnapshotResult } from '@devsync/sdk';
import { mergeTreeConflicts, takeSnapshot } from './snapshot';

const run = promisify(execFile);
export const SNAPSHOT_INTERVAL_MS = 20_000;
/** Unchanged snapshots are still re-sent this often so the server keeps them in its detection window. */
export const KEEPALIVE_MS = 10 * 60_000;

interface Tracked {
  fingerprint: string | null;
  sentAt: number;
  result: GitSnapshotResult | null;
}

/**
 * Observes the worktrees of active Claude Code sessions (read-only git commands), reports changes to the
 * server and runs the merge-tree checks it asks for. Never commits, pushes, merges or changes files.
 */
export class GitWatcher {
  private readonly tracked = new Map<string, Tracked>();
  private readonly checked = new Map<string, string>(); // otherAgent|branch → last verdict key

  constructor(
    private readonly api: DevSyncClient,
    private readonly logger: Logger,
    private readonly options: { fetchForChecks?: boolean; now?: () => number } = {},
  ) {}

  /** Snapshot one worktree now (also called by the PostToolUse hook right after an edit). */
  async observe(
    workingDirectory: string,
    externalSessionId?: string,
    force = false,
  ): Promise<GitSnapshotResult | null> {
    const snapshot = await takeSnapshot(workingDirectory);
    if (!snapshot) return null;
    const now = (this.options.now ?? Date.now)();
    const previous = this.tracked.get(snapshot.worktreePath);
    if (
      !force &&
      previous?.fingerprint === snapshot.fingerprint &&
      now - previous.sentAt < KEEPALIVE_MS
    )
      return previous.result;
    try {
      const result = await this.api.reportGitSnapshot({
        ...snapshot,
        ...(externalSessionId ? { externalSessionId } : {}),
      });
      this.tracked.set(snapshot.worktreePath, {
        fingerprint: snapshot.fingerprint,
        sentAt: now,
        result,
      });
      if (result.tracked && result.repositoryId)
        await this.runMergeChecks(snapshot.worktreePath, result.repositoryId, result.mergeChecks);
      return result;
    } catch (error) {
      if (error instanceof DevSyncApiError && error.status === 401) throw error;
      this.logger.debug({ err: (error as Error).message }, 'git snapshot not sent (offline?)');
      return previous?.result ?? null;
    }
  }

  /** Periodic pass over the worktrees of the active sessions. */
  async tick(sessions: { externalSessionId: string; workingDirectory?: string | undefined }[]) {
    const seen = new Set<string>();
    for (const s of sessions) {
      if (!s.workingDirectory || seen.has(s.workingDirectory)) continue;
      seen.add(s.workingDirectory);
      await this.observe(s.workingDirectory, s.externalSessionId).catch((error: unknown) =>
        this.logger.warn({ err: (error as Error).message }, 'git observe failed'),
      );
    }
  }

  private async runMergeChecks(
    cwd: string,
    repositoryId: string,
    checks: GitSnapshotResult['mergeChecks'],
  ) {
    for (const check of checks) {
      const ref = await this.resolveRef(cwd, check.otherBranch);
      if (!ref) continue; // the other branch is not available here (not pushed): line overlap stays the signal
      const conflicting = await mergeTreeConflicts(cwd, ref);
      if (conflicting === null) continue;
      const relevant = conflicting.filter((f) => check.files.includes(f));
      const key = `${check.otherAgentId}|${check.otherBranch}`;
      const verdict = relevant.sort().join(',');
      if (this.checked.get(key) === verdict) continue;
      this.checked.set(key, verdict);
      if (relevant.length)
        await this.api.reportMergeCheck({
          repositoryId,
          otherAgentId: check.otherAgentId,
          otherBranch: check.otherBranch,
          conflictingFiles: relevant,
        });
    }
  }

  /** Local branch (same machine, another worktree) or remote-tracking branch, fetched if allowed. */
  private async resolveRef(cwd: string, branch: string): Promise<string | null> {
    const exists = async (ref: string) => {
      try {
        await run('git', ['-C', cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
          timeout: 3000,
        });
        return true;
      } catch {
        return false;
      }
    };
    if (await exists(`origin/${branch}`)) return `origin/${branch}`;
    if (await exists(branch)) return branch;
    if (this.options.fetchForChecks === false) return null;
    try {
      // Updates only the remote-tracking ref of that branch; the working tree and local branches are untouched.
      await run(
        'git',
        [
          '-C',
          cwd,
          'fetch',
          '--quiet',
          '--no-tags',
          'origin',
          `refs/heads/${branch}:refs/remotes/origin/${branch}`,
        ],
        { timeout: 15_000 },
      );
      return (await exists(`origin/${branch}`)) ? `origin/${branch}` : null;
    } catch {
      return null;
    }
  }
}
