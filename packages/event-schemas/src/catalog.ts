import { z } from 'zod';
import {
  agentStatusSchema,
  conflictKindSchema,
  deliverableFormatSchema,
  idSchema,
  prioritySchema,
  requestStatusSchema,
  requestTypeSchema,
} from '@devsync/validation';

const agentRef = z.object({ agentId: idSchema, userId: idSchema, sessionId: idSchema.optional() });

const requestRef = z.object({
  requestId: idSchema,
  title: z.string().max(200),
  type: requestTypeSchema,
  status: requestStatusSchema,
  priority: prioritySchema,
  requesterUserId: idSchema,
  assigneeUserId: idSchema.optional(),
  assigneeAgentId: idSchema.optional(),
});

/**
 * Catalog of every realtime event type and its payload schema.
 * The key is the envelope `type`. Adding an event = adding an entry here.
 */
export const eventCatalog = {
  'agent.connected': agentRef.extend({ machineId: idSchema, pluginVersion: z.string().max(32).optional() }),
  'agent.disconnected': agentRef.extend({ reason: z.enum(['client', 'timeout', 'revoked', 'server']) }),
  'agent.status.updated': agentRef.extend({ status: agentStatusSchema, previousStatus: agentStatusSchema.optional() }),
  'agent.activity.updated': agentRef.extend({
    kind: z.enum(['session_started', 'session_ended', 'tool_used', 'task_declared', 'summary_published']),
    /** Structured, explicitly published summary — never raw reasoning. */
    summary: z.string().max(500),
    tool: z.string().max(64).optional(),
  }),

  'collaboration.request.created': requestRef,
  'collaboration.request.accepted': requestRef,
  'collaboration.request.updated': requestRef.extend({ changes: z.array(z.string().max(64)).max(20) }),
  'collaboration.request.rejected': requestRef.extend({ reason: z.string().max(1000).optional() }),
  'collaboration.deliverable.ready': z.object({
    requestId: idSchema,
    deliverableId: idSchema,
    versionId: idSchema,
    version: z.number().int().positive(),
    title: z.string().max(200),
    format: deliverableFormatSchema,
  }),

  'knowledge.published': z.object({
    knowledgeId: idSchema,
    versionId: idSchema,
    version: z.number().int().positive(),
    title: z.string().max(200),
    tags: z.array(z.string().max(48)).max(20),
  }),

  'git.activity.detected': z.object({
    repositoryId: idSchema,
    agentId: idSchema.optional(),
    branch: z.string().max(255),
    head: z.string().regex(/^[0-9a-f]{7,64}$/),
    modifiedFiles: z.array(z.string().max(1024)).max(2000),
  }),
  'git.conflict.detected': z.object({
    conflictId: idSchema,
    repositoryId: idSchema,
    kind: conflictKindSchema,
    filePath: z.string().max(1024),
    agentIds: z.array(idSchema).min(2),
  }),

  'notification.created': z.object({
    notificationId: idSchema,
    userId: idSchema,
    kind: z.string().max(64),
    title: z.string().max(200),
    body: z.string().max(2000).optional(),
    link: z.string().max(512).optional(),
    playSound: z.boolean(),
  }),
} as const satisfies Record<string, z.ZodType>;

export type EventType = keyof typeof eventCatalog;
export type EventPayload<T extends EventType> = z.infer<(typeof eventCatalog)[T]>;
export const EVENT_TYPES = Object.keys(eventCatalog) as EventType[];

export const isEventType = (value: string): value is EventType => value in eventCatalog;
