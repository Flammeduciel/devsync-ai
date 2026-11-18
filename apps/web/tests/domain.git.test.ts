import { describe, expect, it } from 'vitest';
import { conflictFingerprint, detectOverlaps, formatRanges, intersect, type WorktreeState } from '../server/domain/git-overlap';

const state = (changedHunks: WorktreeState['changedHunks'], unmergedFiles: string[] = []): WorktreeState => ({ agentId: 'a', userId: 'u', branch: 'b', changedHunks, unmergedFiles });

describe('git overlap detection', () => {
  it('treats adjacent changes as overlapping, like git merge', () => {
    expect(intersect([[10, 12]], [[13, 20]])).toEqual([[13, 13]]);
    expect(intersect([[10, 12]], [[14, 20]])).toEqual([]);
    expect(intersect([[10, 20]], [[15, 16]])).toEqual([[15, 16]]);
  });

  it('distinguishes file, line and confirmed overlaps, most severe first', () => {
    const mine = state({ 'payment.ts': [[40, 60]], 'cart.ts': [[1, 5]], 'readme.md': [[1, 1]], 'merge.ts': [[3, 3]] }, ['merge.ts']);
    const theirs = state({ 'payment.ts': [[55, 70]], 'cart.ts': [[30, 40]], 'merge.ts': [[100, 101]] });
    expect(detectOverlaps(mine, theirs).map((o) => [o.filePath, o.kind, o.shared])).toEqual([
      ['merge.ts', 'CONFIRMED_CONFLICT', []],
      ['payment.ts', 'LINE_OVERLAP', [[55, 60]]],
      ['cart.ts', 'FILE_OVERLAP', []],
    ]);
  });

  it('identifies a conflict independently of who detected it', () => {
    expect(conflictFingerprint('r', 'f', 'a1', 'a2')).toBe(conflictFingerprint('r', 'f', 'a2', 'a1'));
    expect(formatRanges([[3, 3], [10, 14]])).toBe('3, 10-14');
  });
});
