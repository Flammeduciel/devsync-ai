import type { Db, TeamRole } from '@devsync/database';

export const membersRepository = {
  find(db: Db, teamId: string, userId: string) {
    return db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
  },

  list(db: Db, teamId: string) {
    return db.teamMember.findMany({
      where: { teamId, user: { deletedAt: null } },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  },

  countOwners(db: Db, teamId: string) {
    return db.teamMember.count({ where: { teamId, role: 'OWNER' } });
  },

  create(db: Db, data: { teamId: string; userId: string; role: TeamRole }) {
    return db.teamMember.create({ data });
  },

  updateRole(db: Db, teamId: string, userId: string, role: TeamRole) {
    return db.teamMember.update({ where: { teamId_userId: { teamId, userId } }, data: { role } });
  },

  /** Removing a member also removes their explicit project memberships in that team. */
  async remove(db: Db, teamId: string, userId: string) {
    await db.projectMember.deleteMany({ where: { teamId, userId } });
    await db.teamMember.delete({ where: { teamId_userId: { teamId, userId } } });
  },
};
