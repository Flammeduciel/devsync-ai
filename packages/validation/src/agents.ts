import { z } from 'zod';
import { agentStatusSchema } from './enums';
import { idSchema } from './primitives';

const label = z.string().trim().min(1).max(100);

/** Bridge → server: start the device authorization flow (`devsync login`). */
export const deviceAuthorizeSchema = z.object({
  machineName: label,
  hostname: z.string().max(255).optional(),
  os: z.string().max(100).optional(),
  bridgeVersion: z.string().max(32),
});
export type DeviceAuthorizeInput = z.infer<typeof deviceAuthorizeSchema>;

export const deviceTokenRequestSchema = z.object({ deviceCode: z.string().min(20).max(200) });

/** Browser → server: approve a pending device for a team. */
export const deviceApproveSchema = z.object({
  userCode: z.string().trim().max(20),
  teamId: idSchema,
});
export type DeviceApproveInput = z.infer<typeof deviceApproveSchema>;

/** Statuses an agent may declare; OFFLINE is decided by the server only. */
export const declaredAgentStatusSchema = agentStatusSchema.exclude(['OFFLINE']);

export const registerSessionSchema = z.object({
  agentName: label.default('claude-code'),
  externalSessionId: z.string().min(1).max(200),
  workingDirectory: z.string().max(1024).optional(),
  branch: z.string().max(255).optional(),
  /** Explicit project, or a Git remote used to find the project the repository belongs to. */
  projectId: idSchema.optional(),
  repositoryRemote: z.string().max(500).optional(),
  pluginVersion: z.string().max(32).optional(),
  specialties: z.array(z.string().trim().toLowerCase().min(1).max(48)).max(20).optional(),
});
export type RegisterSessionInput = z.input<typeof registerSessionSchema>;

export const heartbeatSchema = z.object({
  status: declaredAgentStatusSchema.optional(),
  /** Explicitly declared current task; null clears it. Never inferred. */
  currentTask: z.string().trim().max(500).nullable().optional(),
});
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

export const activityKindSchema = z.enum([
  'session_started',
  'session_ended',
  'tool_used',
  'task_declared',
  'summary_published',
]);

export const publishActivitySchema = z.object({
  sessionId: idSchema,
  kind: activityKindSchema.exclude(['session_started', 'session_ended']),
  summary: z.string().trim().min(1).max(500),
  tool: z.string().max(64).optional(),
  /** Producer-generated id: retries of the same activity are ignored. */
  id: idSchema.optional(),
});
export type PublishActivityInput = z.infer<typeof publishActivitySchema>;
