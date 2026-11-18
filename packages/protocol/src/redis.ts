/** Redis pub/sub channels between the web app (producer) and the realtime gateway (consumer). */
export const redisChannels = {
  /** Persisted envelopes (with sequence), JSON-encoded, to fan out to sockets. */
  events: 'devsync:events',
  /** Control messages for the gateway, e.g. disconnect a revoked machine. */
  control: 'devsync:control',
} as const;

export type ControlMessage = { type: 'machine.revoked'; machineId: string; teamId: string };
