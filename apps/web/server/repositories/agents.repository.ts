import type { AgentStatus, Db, Prisma } from '@devsync/database';

export const agentsRepository = {
  upsertAgent(
    db: Db,
    data: {
      teamId: string;
      userId: string;
      machineId: string;
      name: string;
      pluginVersion?: string | undefined;
      specialties?: string[] | undefined;
    },
  ) {
    return db.agent.upsert({
      where: { machineId_name: { machineId: data.machineId, name: data.name } },
      create: {
        teamId: data.teamId,
        userId: data.userId,
        machineId: data.machineId,
        name: data.name,
        pluginVersion: data.pluginVersion ?? null,
        specialties: data.specialties ?? [],
      },
      update: {
        ...(data.pluginVersion ? { pluginVersion: data.pluginVersion } : {}),
        ...(data.specialties ? { specialties: data.specialties } : {}),
      },
    });
  },

  findAgent(db: Db, agentId: string) {
    return db.agent.findUnique({ where: { id: agentId } });
  },

  updateAgent(db: Db, agentId: string, data: Prisma.AgentUncheckedUpdateInput) {
    return db.agent.update({ where: { id: agentId }, data });
  },

  upsertSession(
    db: Db,
    data: {
      teamId: string;
      agentId: string;
      externalSessionId: string;
      projectId: string | null;
      workingDirectory?: string | undefined;
      branch?: string | undefined;
      now: Date;
    },
  ) {
    const fields = {
      projectId: data.projectId,
      workingDirectory: data.workingDirectory ?? null,
      branch: data.branch ?? null,
      status: 'ONLINE' as const,
      lastHeartbeatAt: data.now,
      endedAt: null,
    };
    return db.agentSession.upsert({
      where: {
        agentId_externalSessionId: {
          agentId: data.agentId,
          externalSessionId: data.externalSessionId,
        },
      },
      create: {
        teamId: data.teamId,
        agentId: data.agentId,
        externalSessionId: data.externalSessionId,
        startedAt: data.now,
        ...fields,
      },
      update: fields,
    });
  },

  /** Active session of an agent that belongs to the given machine (ownership check in one query). */
  findActiveSession(db: Db, sessionId: string, machineId: string) {
    return db.agentSession.findFirst({
      where: { id: sessionId, endedAt: null, agent: { machineId } },
      include: { agent: true },
    });
  },

  updateSession(db: Db, sessionId: string, data: Prisma.AgentSessionUncheckedUpdateInput) {
    return db.agentSession.update({ where: { id: sessionId }, data });
  },

  activeSessionStatuses(db: Db, agentId: string) {
    return db.agentSession.findMany({
      where: { agentId, endedAt: null },
      select: { status: true },
    });
  },

  staleSessions(db: Db, before: Date, limit: number, teamId?: string) {
    return db.agentSession.findMany({
      where: { endedAt: null, lastHeartbeatAt: { lt: before }, ...(teamId ? { teamId } : {}) },
      include: { agent: true },
      take: limit,
    });
  },

  activeSessionsOfMachine(db: Db, machineId: string) {
    return db.agentSession.findMany({
      where: { endedAt: null, agent: { machineId } },
      include: { agent: true },
    });
  },

  createActivity(
    db: Db,
    data: {
      id?: string | undefined;
      teamId: string;
      agentId: string;
      sessionId: string | null;
      projectId: string | null;
      kind: string;
      summary: string;
      tool?: string | undefined;
      occurredAt: Date;
    },
  ) {
    return db.agentActivity.create({ data: { ...data, tool: data.tool ?? null } });
  },

  activityExists(db: Db, id: string) {
    return db.agentActivity.findUnique({ where: { id }, select: { id: true } });
  },

  listForTeam(db: Db, teamId: string) {
    return db.agent.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, name: true } },
        machine: { select: { id: true, name: true, revokedAt: true } },
        sessions: {
          where: { endedAt: null },
          select: {
            id: true,
            projectId: true,
            branch: true,
            status: true,
            startedAt: true,
            lastHeartbeatAt: true,
          },
          orderBy: { startedAt: 'desc' },
        },
      },
      orderBy: [{ lastActivityAt: { sort: 'desc', nulls: 'last' } }],
    });
  },
};

export type { AgentStatus };
