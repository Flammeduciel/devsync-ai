import type { Db, TeamRole } from '@devsync/database';

export const invitationsRepository = {
  create(
    db: Db,
    data: { teamId: string; email: string; role: TeamRole; tokenHash: string; invitedById: string; expiresAt: Date },
  ) {
    return db.teamInvitation.create({ data });
  },

  findById(db: Db, teamId: string, invitationId: string) {
    return db.teamInvitation.findFirst({ where: { id: invitationId, teamId } });
  },

  findByTokenHash(db: Db, tokenHash: string) {
    return db.teamInvitation.findUnique({
      where: { tokenHash },
      include: { team: { select: { id: true, name: true, slug: true, deletedAt: true } } },
    });
  },

  listPending(db: Db, teamId: string, now: Date) {
    return db.teamInvitation.findMany({
      where: { teamId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      include: { invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Revokes every still-pending invitation for an email (re-inviting replaces the previous one). */
  revokePendingForEmail(db: Db, teamId: string, email: string, now: Date) {
    return db.teamInvitation.updateMany({
      where: { teamId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
  },

  revoke(db: Db, invitationId: string, now: Date) {
    return db.teamInvitation.update({ where: { id: invitationId }, data: { revokedAt: now } });
  },

  markAccepted(db: Db, invitationId: string, now: Date) {
    return db.teamInvitation.update({ where: { id: invitationId }, data: { acceptedAt: now } });
  },
};
