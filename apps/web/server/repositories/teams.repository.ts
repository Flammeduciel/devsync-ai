import type { Db, TeamRole } from '@devsync/database';

export const teamsRepository = {
  findActiveById(db: Db, teamId: string) {
    return db.team.findFirst({ where: { id: teamId, deletedAt: null } });
  },

  findActiveBySlug(db: Db, slug: string) {
    return db.team.findFirst({ where: { slug, deletedAt: null } });
  },

  create(db: Db, data: { name: string; slug: string; ownerId: string }) {
    return db.team.create({
      data: {
        name: data.name,
        slug: data.slug,
        members: { create: { userId: data.ownerId, role: 'OWNER' } },
        autonomyPolicies: { create: {} },
      },
    });
  },

  update(db: Db, teamId: string, data: { name?: string; slug?: string }) {
    return db.team.update({ where: { id: teamId }, data });
  },

  softDelete(db: Db, teamId: string, at: Date) {
    // The slug is released so it can be reused by a new team.
    return db.team.update({
      where: { id: teamId },
      data: { deletedAt: at, slug: `deleted-${teamId}` },
    });
  },

  listForUser(db: Db, userId: string) {
    return db.teamMember.findMany({
      where: { userId, team: { deletedAt: null } },
      include: { team: true },
      orderBy: { joinedAt: 'asc' },
    });
  },
};

export type TeamMembershipRole = TeamRole;
