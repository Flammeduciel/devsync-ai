import { z } from 'zod';

/** Enumerations shared by the database, the API, the protocol and the UI. Keep in sync with schema.prisma. */
export const teamRoleSchema = z.enum(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']);
export type TeamRole = z.infer<typeof teamRoleSchema>;

export const agentStatusSchema = z.enum([
  'ONLINE',
  'OFFLINE',
  'IDLE',
  'WORKING',
  'WAITING',
  'ERROR',
]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const actorTypeSchema = z.enum(['HUMAN', 'AGENT', 'SYSTEM']);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const requestTypeSchema = z.enum([
  'KNOWLEDGE',
  'WORK',
  'DEPENDENCY',
  'REVIEW',
  'COLLABORATION',
]);
export type RequestType = z.infer<typeof requestTypeSchema>;

export const requestStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'IN_PROGRESS',
  'WAITING_FOR_CLARIFICATION',
  'COMPLETED',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
]);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const prioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export type Priority = z.infer<typeof prioritySchema>;

export const autonomyLevelSchema = z.enum(['SUGGEST', 'CONTROLLED', 'COORDINATED']);
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>;

export const deliverableFormatSchema = z.enum([
  'MARKDOWN',
  'JSON',
  'OPENAPI',
  'PDF',
  'IMAGE',
  'ARCHIVE',
  'GIT_REF',
  'PULL_REQUEST',
]);
export type DeliverableFormat = z.infer<typeof deliverableFormatSchema>;

export const conflictKindSchema = z.enum([
  'FILE_OVERLAP',
  'LINE_OVERLAP',
  'POTENTIAL_CONFLICT',
  'CONFIRMED_CONFLICT',
]);
export type ConflictKind = z.infer<typeof conflictKindSchema>;

export const projectRoleSchema = z.enum(['MAINTAINER', 'CONTRIBUTOR', 'VIEWER']);
export type ProjectRole = z.infer<typeof projectRoleSchema>;
