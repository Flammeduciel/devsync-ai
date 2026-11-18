import { z } from 'zod';
import { deliverableFormatSchema, prioritySchema, requestStatusSchema, requestTypeSchema } from './enums';
import { idSchema } from './primitives';
import { projectLocatorSchema } from './team';

export const expectedDeliverableSchema = z.object({
  title: z.string().trim().min(1).max(200),
  format: deliverableFormatSchema,
  description: z.string().trim().max(1000).optional(),
});

export const createRequestSchema = projectLocatorSchema
  .extend({
    type: requestTypeSchema,
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(5000),
    instructions: z.string().trim().max(10_000).optional(),
    priority: prioritySchema.default('NORMAL'),
    assigneeUserId: idSchema.optional(),
    assigneeAgentId: idSchema.optional(),
    expectedDeliverables: z.array(expectedDeliverableSchema).max(10).default([]),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    /** Request that led to this one (agent chains, loop prevention). */
    parentRequestId: idSchema.optional(),
    /** Requester's task blocked until this request is done (DEPENDENCY requests). */
    dependentTaskId: idSchema.optional(),
    /** Force human approval before the assignee sees it (team_suggest_collaboration). */
    suggestOnly: z.boolean().default(false),
    agentName: z.string().trim().min(1).max(100).default('claude-code'),
  })
  .refine((v) => v.assigneeUserId || v.assigneeAgentId, { message: 'An assignee (user or agent) is required', path: ['assigneeUserId'] });
export type CreateRequestInput = z.input<typeof createRequestSchema>;

export const requestActionSchema = z
  .object({
    action: z.enum(['approve', 'accept', 'reject', 'start', 'clarify', 'answer', 'complete', 'cancel']),
    comment: z.string().trim().max(5000).optional(),
    agentName: z.string().trim().min(1).max(100).default('claude-code'),
  })
  .refine((v) => !['clarify', 'answer'].includes(v.action) || !!v.comment, { message: 'A question or an answer is required', path: ['comment'] });
export type RequestActionInput = z.input<typeof requestActionSchema>;

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
});
export type CommentInput = z.input<typeof commentSchema>;

export const listRequestsSchema = z.object({
  projectId: idSchema.optional(),
  status: z.array(requestStatusSchema).max(8).optional(),
  type: requestTypeSchema.optional(),
  scope: z.enum(['all', 'created', 'assigned']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListRequestsInput = z.input<typeof listRequestsSchema>;

export const createDeliverableSchema = projectLocatorSchema.extend({
  requestId: idSchema.optional(),
  taskId: idSchema.optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  format: deliverableFormatSchema,
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
});
export type CreateDeliverableInput = z.input<typeof createDeliverableSchema>;

export const deliverableVersionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inline'), content: z.string().min(1).max(1_000_000), contentType: z.string().max(100).optional(), fileName: z.string().max(200).optional(), notes: z.string().max(2000).optional() }),
  z.object({ kind: z.literal('upload'), fileName: z.string().min(1).max(200), contentType: z.string().min(3).max(100), sizeBytes: z.number().int().positive(), checksumSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(), notes: z.string().max(2000).optional() }),
  z.object({ kind: z.literal('git_ref'), commit: z.string().regex(/^[0-9a-f]{7,64}$/), branch: z.string().max(255).optional(), path: z.string().max(1024).optional(), repositoryId: idSchema.optional(), notes: z.string().max(2000).optional() }),
  z.object({ kind: z.literal('url'), url: z.url().refine((u) => /^https:\/\//.test(u), 'HTTPS only'), notes: z.string().max(2000).optional() }),
]);
export type DeliverableVersionInput = z.input<typeof deliverableVersionSchema>;

export const attachmentUploadSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  commentId: idSchema.optional(),
});
export type AttachmentUploadInput = z.input<typeof attachmentUploadSchema>;

export const createTaskSchema = projectLocatorSchema.extend({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z.object({ status: z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']) });
export const addDependencySchema = z.object({ blockingTaskId: idSchema, description: z.string().trim().max(500).optional() });

export const notificationKindSchema = z.enum([
  'AGENT_CONNECTED', 'AGENT_DISCONNECTED', 'REQUEST_CREATED', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'REQUEST_IN_PROGRESS',
  'REQUEST_CLARIFICATION', 'DELIVERABLE_READY', 'GIT_CONFLICT', 'KNOWLEDGE_PUBLISHED', 'DEPENDENCY_RESOLVED', 'INVITATION',
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationPreferencesSchema = z.object({
  preferences: z
    .array(z.object({ kind: notificationKindSchema, inApp: z.boolean(), desktop: z.boolean(), sound: z.boolean() }))
    .max(20),
});

export const autonomyPolicyUpdateSchema = z.object({
  projectId: idSchema.nullable().default(null),
  level: z.enum(['SUGGEST', 'CONTROLLED', 'COORDINATED']),
  maxRequestsPerHour: z.number().int().min(1).max(500),
  maxPriority: prioritySchema,
  maxChainDepth: z.number().int().min(0).max(10),
  allowedAgentIds: z.array(idSchema).max(200).default([]),
  requireApprovalActions: z.array(z.enum(['request.create'])).max(5).default([]),
});
export type AutonomyPolicyUpdate = z.input<typeof autonomyPolicyUpdateSchema>;

export const broadcastSchema = projectLocatorSchema.extend({
  message: z.string().trim().min(3).max(1000),
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
});
