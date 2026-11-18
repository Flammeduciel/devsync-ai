import type { Db, GitProvider, ProjectRole } from '@devsync/database';

export const projectsRepository = {
  /** Active project of an active team. */
  findActiveById(db: Db, projectId: string) {
    return db.project.findFirst({
      where: { id: projectId, deletedAt: null, team: { deletedAt: null } },
    });
  },

  findProjectMember(db: Db, projectId: string, userId: string) {
    return db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  },

  /** `memberUserId` restricts the list to projects where that user is an explicit member. */
  list(db: Db, teamId: string, options: { memberUserId?: string } = {}) {
    return db.project.findMany({
      where: {
        teamId,
        deletedAt: null,
        ...(options.memberUserId ? { members: { some: { userId: options.memberUserId } } } : {}),
      },
      include: {
        _count: { select: { members: true, repositories: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  create(
    db: Db,
    data: {
      teamId: string;
      name: string;
      slug: string;
      description?: string | undefined;
      createdById: string;
    },
  ) {
    return db.project.create({
      data: {
        teamId: data.teamId,
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        createdById: data.createdById,
      },
    });
  },

  update(
    db: Db,
    projectId: string,
    data: { name?: string; slug?: string; description?: string | undefined },
  ) {
    return db.project.update({ where: { id: projectId }, data });
  },

  softDelete(db: Db, projectId: string, at: Date) {
    return db.project.update({
      where: { id: projectId },
      data: { deletedAt: at, slug: `deleted-${projectId}` },
    });
  },

  listMembers(db: Db, projectId: string) {
    return db.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  upsertMember(
    db: Db,
    data: { teamId: string; projectId: string; userId: string; role: ProjectRole },
  ) {
    return db.projectMember.upsert({
      where: { projectId_userId: { projectId: data.projectId, userId: data.userId } },
      create: data,
      update: { role: data.role },
    });
  },

  removeMember(db: Db, projectId: string, userId: string) {
    return db.projectMember.deleteMany({ where: { projectId, userId } });
  },

  listRepositories(db: Db, projectId: string) {
    return db.repository.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  },

  findRepository(db: Db, projectId: string, repositoryId: string) {
    return db.repository.findFirst({ where: { id: repositoryId, projectId, deletedAt: null } });
  },

  createRepository(
    db: Db,
    data: {
      teamId: string;
      projectId: string;
      name: string;
      remoteUrl: string;
      provider: GitProvider;
      defaultBranch: string;
    },
  ) {
    return db.repository.create({ data });
  },

  softDeleteRepository(db: Db, repositoryId: string, at: Date) {
    // remoteUrl is unique per project: free it so the repository can be re-added.
    return db.repository.update({
      where: { id: repositoryId },
      data: { deletedAt: at, remoteUrl: `deleted:${repositoryId}` },
    });
  },
};
