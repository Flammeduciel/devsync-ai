import { z } from 'zod';
import { agentStatusSchema } from './enums';
import { idSchema } from './primitives';

/** Where an agent works: explicit project or the Git remote of its working directory. */
export const projectLocatorSchema = z.object({
  projectId: idSchema.optional(),
  remote: z.string().max(500).optional(),
});

export const contextQuerySchema = projectLocatorSchema;
export type ContextQuery = z.infer<typeof contextQuerySchema>;

export const agentSearchSchema = projectLocatorSchema.extend({
  query: z.string().trim().max(200).optional(),
  status: z.array(agentStatusSchema).max(6).optional(),
  includeOffline: z.coerce.boolean().default(false),
});
export type AgentSearchInput = z.input<typeof agentSearchSchema>;

export const activityQuerySchema = projectLocatorSchema.extend({
  agentId: idSchema.optional(),
  since: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ActivityQuery = z.input<typeof activityQuerySchema>;

export const expertQuerySchema = projectLocatorSchema.extend({
  topic: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type ExpertQuery = z.input<typeof expertQuerySchema>;

export const resourceTypeSchema = z.enum(['FILE', 'DIRECTORY', 'API_CONTRACT', 'TOPIC']);

export const claimResourceSchema = projectLocatorSchema.extend({
  agentName: z.string().trim().min(1).max(100).default('claude-code'),
  resourceType: resourceTypeSchema,
  resourceKey: z.string().trim().min(1).max(500),
  reason: z.string().trim().max(500).optional(),
  ttlMinutes: z.number().int().min(1).max(240).default(60),
});
export type ClaimResourceInput = z.input<typeof claimResourceSchema>;
