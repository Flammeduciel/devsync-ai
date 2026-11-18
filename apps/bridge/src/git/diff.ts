/** A [start, end] line range (1-based, inclusive) in the merge-base version of a file. */
export type LineRange = [number, number];

/**
 * Parses `git diff -U0` output into the line ranges of the *base* version each file's hunks touch.
 * Base coordinates let two agents' changes be compared: both diverge from the same merge-base.
 * Pure insertions (old count 0) are recorded as the single line they follow.
 */
export function parseZeroContextDiff(diff: string): Record<string, LineRange[]> {
  const result: Record<string, LineRange[]> = {};
  let current: string | null = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      current = path === '/dev/null' ? current : path.replace(/^b\//, '');
      if (current) result[current] ??= [];
      continue;
    }
    if (line.startsWith('--- ')) {
      const path = line.slice(4).trim();
      // Deleted files keep their old path (the +++ side is /dev/null).
      if (path !== '/dev/null') current = path.replace(/^a\//, '');
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const range: LineRange =
        count === 0 ? [Math.max(start, 1), Math.max(start, 1)] : [start, start + count - 1];
      (result[current] ??= []).push(range);
    }
  }
  return result;
}

/** Merges overlapping or adjacent ranges and caps the number per file (payload stays small). */
export function compactRanges(ranges: LineRange[], max = 50): LineRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: LineRange[] = [];
  for (const r of sorted) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  if (merged.length <= max) return merged;
  return [[merged[0]![0], merged.at(-1)![1]]]; // too many hunks: one envelope range
}

/** `git status --porcelain=v1 -z` → staged, modified (worktree), untracked and unmerged paths. */
export function parsePorcelainStatus(output: string) {
  const staged = new Set<string>();
  const modified = new Set<string>();
  const untracked = new Set<string>();
  const unmerged = new Set<string>();
  const entries = output.split('\0').filter(Boolean);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const x = entry[0]!;
    const y = entry[1]!;
    const path = entry.slice(3);
    if (x === 'R' || x === 'C') i += 1; // rename/copy: the next entry is the original path
    if (x === '?' && y === '?') {
      untracked.add(path);
      continue;
    }
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      unmerged.add(path);
      continue;
    }
    if (x !== ' ' && x !== '!') staged.add(path);
    if (y !== ' ' && y !== '!') modified.add(path);
  }
  return {
    staged: [...staged],
    modified: [...modified],
    untracked: [...untracked],
    unmerged: [...unmerged],
  };
}
