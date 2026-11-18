import { createHash } from 'node:crypto';
import type { ConflictKind } from '@devsync/validation';

export type LineRange = [number, number];

export interface WorktreeState {
  agentId: string;
  userId: string;
  branch: string;
  /** Base-version ranges touched per file (committed since merge-base + uncommitted). */
  changedHunks: Record<string, LineRange[]>;
  unmergedFiles: string[];
}

export interface Overlap {
  filePath: string;
  kind: Exclude<ConflictKind, 'POTENTIAL_CONFLICT'>;
  mine: LineRange[];
  theirs: LineRange[];
  /** Base lines both sides touch (empty for a file-level overlap). */
  shared: LineRange[];
}

export const SEVERITY: Record<ConflictKind, number> = { FILE_OVERLAP: 1, LINE_OVERLAP: 2, POTENTIAL_CONFLICT: 3, CONFIRMED_CONFLICT: 4 };

/**
 * Git reports a conflict when both sides change the same lines or directly adjacent ones, so ranges
 * that touch (distance ≤ 1) count as overlapping.
 */
export function intersect(a: LineRange[], b: LineRange[]): LineRange[] {
  const out: LineRange[] = [];
  for (const [s1, e1] of a) {
    for (const [s2, e2] of b) {
      if (s1 <= e2 + 1 && s2 <= e1 + 1) out.push([Math.max(s1, s2), Math.min(e1, e2) >= Math.max(s1, s2) ? Math.min(e1, e2) : Math.max(s1, s2)]);
    }
  }
  return out;
}

/** Overlaps between my worktree and another agent's, most severe first. */
export function detectOverlaps(mine: WorktreeState, other: WorktreeState): Overlap[] {
  const overlaps: Overlap[] = [];
  for (const [filePath, myRanges] of Object.entries(mine.changedHunks)) {
    const theirRanges = other.changedHunks[filePath];
    if (!theirRanges) continue;
    const shared = intersect(myRanges, theirRanges);
    const confirmed = mine.unmergedFiles.includes(filePath) || other.unmergedFiles.includes(filePath);
    overlaps.push({ filePath, kind: confirmed ? 'CONFIRMED_CONFLICT' : shared.length ? 'LINE_OVERLAP' : 'FILE_OVERLAP', mine: myRanges, theirs: theirRanges, shared });
  }
  return overlaps.sort((x, y) => SEVERITY[y.kind] - SEVERITY[x.kind] || x.filePath.localeCompare(y.filePath));
}

/** One conflict row per (repository, file, pair of agents), whatever the order of detection. */
export function conflictFingerprint(repositoryId: string, filePath: string, agentA: string, agentB: string): string {
  const [x, y] = [agentA, agentB].sort();
  return createHash('sha256').update(`${repositoryId}|${filePath}|${x}|${y}`).digest('hex');
}

export const formatRanges = (ranges: LineRange[]): string => ranges.map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`)).join(', ');
