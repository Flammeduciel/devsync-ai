import type { Db, Prisma, TaskStatus } from '@devsync/database';

export const tasksRepository = {
  create(db: Db, data: Prisma.AgentTaskUncheckedCreateInput) {
    return db.agentTask.create({ data });
  },
  findById(db: Db, teamId: string, taskId: string) {
    return db.agentTask.findFirst({ where: { id: taskId, teamId } });
  },
  findForRequest(db: Db, requestId: string) {
    return db.agentTask.findFirst({ where: { requestId }, orderBy: { createdAt: 'asc' } });
  },
  setStatus(db: Db, taskId: string, status: TaskStatus, now: Date) {
    return db.agentTask.update({
      where: { id: taskId },
      data: {
        status,
        ...(status === 'IN_PROGRESS' ? { startedAt: now } : {}),
        ...(status === 'DONE' || status === 'CANCELLED' ? { completedAt: now } : {}),
      },
    });
  },
  addDependency(
    db: Db,
    data: {
      teamId: string;
      projectId: string;
      dependentTaskId: string;
      blockingTaskId: string;
      description?: string | undefined;
    },
  ) {
    return db.dependency.upsert({
      where: {
        dependentTaskId_blockingTaskId: {
          dependentTaskId: data.dependentTaskId,
          blockingTaskId: data.blockingTaskId,
        },
      },
      create: { ...data, description: data.description ?? null },
      update: {},
    });
  },
  /** Open dependencies a finished task was blocking, with who is waiting for them. */
  openDependenciesBlockedBy(db: Db, blockingTaskId: string) {
    return db.dependency.findMany({
      where: { blockingTaskId, status: 'OPEN' },
      include: {
        dependentTask: {
          select: {
            id: true,
            title: true,
            assigneeUserId: true,
            assigneeAgentId: true,
            status: true,
          },
        },
      },
    });
  },
  resolveDependency(db: Db, dependencyId: string, now: Date) {
    return db.dependency.update({
      where: { id: dependencyId },
      data: { status: 'RESOLVED', resolvedAt: now },
    });
  },
  graph(db: Db, taskIds: string[]) {
    return db.dependency.findMany({
      where: { OR: [{ dependentTaskId: { in: taskIds } }, { blockingTaskId: { in: taskIds } }] },
      include: {
        dependentTask: { select: { id: true, title: true, status: true, requestId: true } },
        blockingTask: { select: { id: true, title: true, status: true, requestId: true } },
      },
    });
  },
};
