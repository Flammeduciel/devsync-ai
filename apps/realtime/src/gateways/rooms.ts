/** Rooms are joined by the server only, after authentication. */
export const roomFor = {
  team: (teamId: string) => `team:${teamId}`,
  /** A user within a team: events with an audience go here (a user's other teams never see them). */
  member: (teamId: string, userId: string) => `member:${teamId}:${userId}`,
  machine: (machineId: string) => `machine:${machineId}`,
  /** Every socket of a user (any team, any client): used to disconnect a suspended account. */
  user: (userId: string) => `user:${userId}`,
} as const;
