import type { Db } from '@devsync/database';

export const machinesRepository = {
  create(
    db: Db,
    data: {
      teamId: string;
      userId: string;
      name: string;
      hostname?: string | undefined;
      os?: string | undefined;
      bridgeVersion: string;
      deviceTokenHash: string;
    },
  ) {
    return db.agentMachine.create({
      data: {
        ...data,
        hostname: data.hostname ?? null,
        os: data.os ?? null,
        lastSeenAt: new Date(),
      },
    });
  },

  /** Token lookup for authentication: active machine of an active team and user. */
  findActiveByTokenHash(db: Db, deviceTokenHash: string) {
    return db.agentMachine.findFirst({
      where: {
        deviceTokenHash,
        revokedAt: null,
        team: { deletedAt: null, suspendedAt: null },
        user: { deletedAt: null, suspendedAt: null },
      },
    });
  },

  findById(db: Db, teamId: string, machineId: string) {
    return db.agentMachine.findFirst({ where: { id: machineId, teamId } });
  },

  list(db: Db, teamId: string, options: { userId?: string } = {}) {
    return db.agentMachine.findMany({
      where: { teamId, revokedAt: null, ...(options.userId ? { userId: options.userId } : {}) },
      include: { user: { select: { id: true, name: true } }, _count: { select: { agents: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  touch(db: Db, machineId: string, at: Date) {
    return db.agentMachine.update({ where: { id: machineId }, data: { lastSeenAt: at } });
  },

  revoke(db: Db, machineId: string, at: Date) {
    return db.agentMachine.update({ where: { id: machineId }, data: { revokedAt: at } });
  },
};
