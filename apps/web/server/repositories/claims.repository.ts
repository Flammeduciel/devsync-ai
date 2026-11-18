import type { Db, ResourceType } from '@devsync/database';

const activeWhere = (now: Date) => ({ releasedAt: null, expiresAt: { gt: now } });

export const claimsRepository = {
  findActive(
    db: Db,
    projectId: string,
    resourceType: ResourceType,
    resourceKey: string,
    now: Date,
  ) {
    return db.resourceClaim.findFirst({
      where: { projectId, resourceType, resourceKey, ...activeWhere(now) },
      include: {
        agent: { select: { id: true, name: true, user: { select: { id: true, name: true } } } },
      },
    });
  },

  /** Expired claims still hold the partial unique index: close them before a new claim. */
  closeExpired(
    db: Db,
    projectId: string,
    resourceType: ResourceType,
    resourceKey: string,
    now: Date,
  ) {
    return db.resourceClaim.updateMany({
      where: { projectId, resourceType, resourceKey, releasedAt: null, expiresAt: { lte: now } },
      data: { releasedAt: now },
    });
  },

  create(
    db: Db,
    data: {
      teamId: string;
      projectId: string;
      agentId: string;
      sessionId: string | null;
      resourceType: ResourceType;
      resourceKey: string;
      reason?: string | undefined;
      expiresAt: Date;
    },
  ) {
    return db.resourceClaim.create({ data: { ...data, reason: data.reason ?? null } });
  },

  extend(db: Db, claimId: string, expiresAt: Date, reason?: string) {
    return db.resourceClaim.update({
      where: { id: claimId },
      data: { expiresAt, ...(reason ? { reason } : {}) },
    });
  },

  findById(db: Db, teamId: string, claimId: string) {
    return db.resourceClaim.findFirst({
      where: { id: claimId, teamId },
      include: { agent: { select: { machineId: true } } },
    });
  },

  release(db: Db, claimId: string, now: Date) {
    return db.resourceClaim.update({ where: { id: claimId }, data: { releasedAt: now } });
  },

  listActive(db: Db, projectId: string, now: Date) {
    return db.resourceClaim.findMany({
      where: { projectId, ...activeWhere(now) },
      include: {
        agent: { select: { id: true, name: true, user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },
};
