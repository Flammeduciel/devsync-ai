import { z } from 'zod';
import { idSchema } from '@devsync/validation';

/** Kinds of clients that open a realtime connection. */
export const clientKindSchema = z.enum(['dashboard', 'bridge']);
export type ClientKind = z.infer<typeof clientKindSchema>;

/**
 * Sent in Socket.IO `auth` on connect. The token is a short-lived realtime token
 * (dashboard, issued by the web app) or a device token (Bridge). The server derives
 * user/team identity from the token, never from these fields.
 */
export const handshakeSchema = z.object({
  token: z.string().min(20),
  clientKind: clientKindSchema,
  protocolVersion: z.string(),
  clientVersion: z.string().max(32),
  /** Last server sequence the client processed, per team, used to replay missed events. */
  lastSequence: z.record(idSchema, z.number().int().nonnegative()).default({}),
});
export type Handshake = z.infer<typeof handshakeSchema>;

/** Socket.IO rooms. Joining is decided server-side after authorization. */
export const rooms = {
  team: (teamId: string) => `team:${teamId}`,
  project: (projectId: string) => `project:${projectId}`,
  user: (userId: string) => `user:${userId}`,
  agent: (agentId: string) => `agent:${agentId}`,
} as const;

/** Low-level socket channel names (the event `type` lives inside the envelope). */
export const channels = {
  /** client -> server: publish an event, acked */
  publish: 'event:publish',
  /** server -> client: deliver an event, acked by client */
  deliver: 'event:deliver',
  /** client -> server: request replay after reconnect */
  resume: 'session:resume',
  /** server -> client: protocol-level error */
  error: 'session:error',
} as const;
