import { z } from 'zod';
import { idSchema } from './primitives';

const path = z.string().min(1).max(1024);
const lineRange = z.tuple([z.number().int().min(1), z.number().int().min(1)]);
const sha = z.string().regex(/^[0-9a-f]{7,64}$/);

/** Read-only observation of a working tree by the Bridge: paths, line numbers and commit metadata only. */
export const gitSnapshotSchema = z.object({
  externalSessionId: z.string().min(1).max(200).optional(),
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
  remote: z.string().min(1).max(500),
  worktreePath: z.string().min(1).max(1024),
  isLinkedWorktree: z.boolean(),
  branch: z.string().min(1).max(255),
  head: sha,
  lastCommitSha: sha.nullable(),
  lastCommitMessage: z.string().max(200).nullable(),
  baseRef: z.string().max(255).nullable(),
  mergeBase: sha.nullable(),
  aheadBy: z.number().int().min(0),
  behindBy: z.number().int().min(0),
  modifiedFiles: z.array(path).max(500),
  stagedFiles: z.array(path).max(500),
  untrackedFiles: z.array(path).max(500),
  unmergedFiles: z.array(path).max(500),
  changedHunks: z
    .record(path, z.array(lineRange).max(50))
    .refine((h) => Object.keys(h).length <= 500, 'Too many files'),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
export type GitSnapshotInput = z.input<typeof gitSnapshotSchema>;

/** Result of `git merge-tree` run by a Bridge against another agent's branch. */
export const mergeCheckSchema = z.object({
  repositoryId: idSchema,
  otherAgentId: idSchema,
  otherBranch: z.string().min(1).max(255),
  conflictingFiles: z.array(path).max(500),
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
});
export type MergeCheckInput = z.input<typeof mergeCheckSchema>;

export const checkOverlapSchema = z.object({
  remote: z.string().max(500).optional(),
  projectId: idSchema.optional(),
  files: z.array(path).min(1).max(100),
});
export type CheckOverlapInput = z.input<typeof checkOverlapSchema>;

export const conflictStatusSchema = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']);
export const updateConflictSchema = z.object({ status: conflictStatusSchema.exclude(['OPEN']) });
