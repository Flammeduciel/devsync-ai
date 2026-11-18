import { z } from 'zod';
import { idSchema } from './primitives';
import { projectLocatorSchema } from './team';

export const knowledgeKindSchema = z.enum(['DECISION', 'BRAINSTORM', 'DOCUMENTATION', 'API_CONTRACT', 'SOLUTION', 'ANALYSIS', 'INSTRUCTION', 'DELIVERABLE']);
export type KnowledgeKind = z.infer<typeof knowledgeKindSchema>;

export const knowledgeValiditySchema = z.enum(['DRAFT', 'VALID', 'OUTDATED', 'DEPRECATED']);
export type KnowledgeValidity = z.infer<typeof knowledgeValiditySchema>;

export const knowledgeVisibilitySchema = z.enum(['PRIVATE', 'PROJECT']);
export type KnowledgeVisibility = z.infer<typeof knowledgeVisibilitySchema>;

export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9._/-]*$/, 'letters, digits, dot, dash, slash');

export const knowledgeReferenceSchema = z.object({
  type: z.enum(['file', 'commit', 'url', 'deliverable', 'request']),
  ref: z.string().trim().min(1).max(1024),
  repositoryId: idSchema.optional(),
});

export const publishKnowledgeSchema = projectLocatorSchema.extend({
  /** Publish a new version of an existing item instead of creating one. */
  knowledgeId: idSchema.optional(),
  kind: knowledgeKindSchema,
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(1).max(100_000),
  summary: z.string().trim().max(1000).optional(),
  tags: z.array(tagSchema).max(20).default([]),
  references: z.array(knowledgeReferenceSchema).max(50).default([]),
  validity: z.enum(['DRAFT', 'VALID']).default('VALID'),
  /** PRIVATE: only you (and your future sessions); PROJECT: the project's members. Nothing is shared without it. */
  visibility: knowledgeVisibilitySchema.default('PROJECT'),
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
});
export type PublishKnowledgeInput = z.input<typeof publishKnowledgeSchema>;

export const searchKnowledgeSchema = projectLocatorSchema.extend({
  query: z.string().trim().min(2).max(500),
  tags: z.array(tagSchema).max(10).optional(),
  kind: knowledgeKindSchema.optional(),
  includeOutdated: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export type SearchKnowledgeInput = z.input<typeof searchKnowledgeSchema>;

export const setValiditySchema = z.object({
  validity: knowledgeValiditySchema,
  reason: z.string().trim().max(1000).optional(),
});
export type SetValidityInput = z.input<typeof setValiditySchema>;

export const promoteDeliverableSchema = z.object({
  deliverableId: idSchema,
  kind: knowledgeKindSchema.default('API_CONTRACT'),
  tags: z.array(tagSchema).max(20).default([]),
});
export type PromoteDeliverableInput = z.input<typeof promoteDeliverableSchema>;

export const listKnowledgeSchema = z.object({
  projectId: idSchema.optional(),
  /** Only items I authored (private and shared): "show me my results". */
  mine: z.coerce.boolean().default(false),
  visibility: knowledgeVisibilitySchema.optional(),
  kind: knowledgeKindSchema.optional(),
  tag: tagSchema.optional(),
  validity: knowledgeValiditySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListKnowledgeInput = z.input<typeof listKnowledgeSchema>;

export const setVisibilitySchema = z.object({ visibility: knowledgeVisibilitySchema });
