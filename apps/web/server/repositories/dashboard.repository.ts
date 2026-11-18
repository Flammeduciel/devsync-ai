import type { Db } from '@devsync/database';

export const dashboardRepository = {
  async counts(db: Db, teamId: string, visibleProjectIds: string[], now: Date) {
    const [members, agentsOnline, agentsActive, pendingRequests, pendingInvitations, repositories] =
      await Promise.all([
        db.teamMember.count({ where: { teamId } }),
        db.agent.count({ where: { teamId, status: { not: 'OFFLINE' } } }),
        db.agent.count({ where: { teamId, status: 'WORKING' } }),
        db.collaborationRequest.count({
          where: {
            teamId,
            projectId: { in: visibleProjectIds },
            status: 'PENDING',
            deletedAt: null,
          },
        }),
        db.teamInvitation.count({
          where: { teamId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        }),
        db.repository.count({
          where: { teamId, projectId: { in: visibleProjectIds }, deletedAt: null },
        }),
      ]);
    return {
      members,
      agentsOnline,
      agentsActive,
      pendingRequests,
      pendingInvitations,
      repositories,
    };
  },

  recentAudit(db: Db, teamId: string, limit: number) {
    return db.auditLog.findMany({
      where: { teamId },
      include: { actorUser: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
