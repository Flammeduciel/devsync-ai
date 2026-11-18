import { z } from 'zod';
import { projectRoleSchema } from './enums';
import { idSchema, slugSchema } from './primitives';

export const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(2000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const addProjectMemberSchema = z.object({
  userId: idSchema,
  role: projectRoleSchema.default('CONTRIBUTOR'),
});
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;

export const gitProviderSchema = z.enum(['GITHUB', 'GITLAB', 'BITBUCKET', 'OTHER']);

/** Accepts https/ssh/scp-like remotes; normalized to `host/owner/repo` (no credentials, no .git). */
export function normalizeRemoteUrl(raw: string): string | null {
  const value = raw.trim();
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(value);
  let host: string;
  let path: string;
  if (scp) {
    host = scp[1]!;
    path = scp[2]!;
  } else {
    try {
      const url = new URL(value);
      if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol)) return null;
      host = url.hostname;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  path = path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
  if (!host || path.split('/').length < 2) return null;
  return `${host.toLowerCase()}/${path}`;
}

export function detectProvider(normalizedUrl: string): z.infer<typeof gitProviderSchema> {
  if (normalizedUrl.startsWith('github.com/')) return 'GITHUB';
  if (normalizedUrl.startsWith('gitlab.com/')) return 'GITLAB';
  if (normalizedUrl.startsWith('bitbucket.org/')) return 'BITBUCKET';
  return 'OTHER';
}

export const createRepositorySchema = z.object({
  remoteUrl: z
    .string()
    .max(500)
    .transform((v, ctx) => {
      const normalized = normalizeRemoteUrl(v);
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: 'Not a valid Git remote URL' });
        return z.NEVER;
      }
      return normalized;
    }),
  name: z.string().trim().min(1).max(100).optional(),
  defaultBranch: z.string().trim().min(1).max(255).default('main'),
});
export type CreateRepositoryInput = z.input<typeof createRepositorySchema>;
