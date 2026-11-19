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

  updateSpecialties(db: Db, teamId: string, userId: string, specialties: string[]) {
    return db.teamMember.update({
      where: { teamId_userId: { teamId, userId } },
      data: { specialties },
    });
  },

  /** userId → declared specialties, for merging into agent profiles. */
  async specialtiesByUser(db: Db, teamId: string): Promise<Map<string, string[]>> {
    const rows = await db.teamMember.findMany({
      where: { teamId },
      select: { userId: true, specialties: true },
    });
    return new Map(rows.map((r) => [r.userId, r.specialties]));
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
