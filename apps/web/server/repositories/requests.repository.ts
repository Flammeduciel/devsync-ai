import type { Db, Prisma, RequestStatus } from '@devsync/database';

export const requestDetailInclude = {
  project: { select: { id: true, name: true, teamId: true } },
  createdBy: { select: { id: true, name: true } },
  initiatorAgent: { select: { id: true, name: true } },
  assigneeUser: { select: { id: true, name: true } },
  assigneeAgent: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.CollaborationRequestInclude;

export const requestsRepository = {
  findActive(db: Db, requestId: string) {
    return db.collaborationRequest.findFirst({
      where: { id: requestId, deletedAt: null, project: { deletedAt: null }, team: { deletedAt: null } },
      include: requestDetailInclude,
    });
  },

  create(db: Db, data: Prisma.CollaborationRequestUncheckedCreateInput) {
    return db.collaborationRequest.create({ data, include: requestDetailInclude });
  },

  update(db: Db, requestId: string, data: Prisma.CollaborationRequestUncheckedUpdateInput) {
    return db.collaborationRequest.update({ where: { id: requestId }, data, include: requestDetailInclude });
  },

  addHistory(
    db: Db,
    data: { teamId: string; requestId: string; actorType: 'HUMAN' | 'AGENT' | 'SYSTEM'; actorUserId?: string | null; actorAgentId?: string | null; action: string; fromStatus?: RequestStatus | null; toStatus?: RequestStatus | null; data?: Prisma.InputJsonValue },
  ) {
    return db.requestHistory.create({ data: { ...data, data: data.data ?? {} } });
  },

  /** Status the request had before its current clarification (to resume after the answer). */
  async statusBeforeClarification(db: Db, requestId: string): Promise<RequestStatus | null> {
    const entry = await db.requestHistory.findFirst({
      where: { requestId, toStatus: 'WAITING_FOR_CLARIFICATION' },
      orderBy: { createdAt: 'desc' },
      select: { fromStatus: true },
    });
    return entry?.fromStatus ?? null;
  },

  createdHistoryData(db: Db, requestId: string) {
    return db.requestHistory.findFirst({ where: { requestId, action: 'created' }, select: { data: true } });
  },

  countByAgentSince(db: Db, agentId: string, since: Date) {
    return db.collaborationRequest.count({ where: { initiatorAgentId: agentId, createdAt: { gt: since } } });
  },

  findOpenByFingerprint(db: Db, teamId: string, fingerprint: string, since: Date) {
    return db.collaborationRequest.findFirst({
      where: { teamId, fingerprint, createdAt: { gt: since }, deletedAt: null, status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_CLARIFICATION'] } },
      select: { id: true, status: true },
    });
  },

  /** Initiator agents up the parent chain (bounded walk). */
  async chain(db: Db, parentRequestId: string): Promise<{ depth: number; initiators: string[]; teamId: string } | null> {
    const parent = await db.collaborationRequest.findUnique({ where: { id: parentRequestId }, select: { depth: true, teamId: true } });
    if (!parent) return null;
    const initiators: string[] = [];
    let cursor: string | null = parentRequestId;
    for (let i = 0; cursor && i < 20; i++) {
      const row: { initiatorAgentId: string | null; assigneeAgentId: string | null; parentRequestId: string | null } | null =
        await db.collaborationRequest.findUnique({ where: { id: cursor }, select: { initiatorAgentId: true, assigneeAgentId: true, parentRequestId: true } });
      if (!row) break;
      if (row.initiatorAgentId) initiators.push(row.initiatorAgentId);
      cursor = row.parentRequestId;
    }
    return { depth: parent.depth, initiators, teamId: parent.teamId };
  },

  list(db: Db, where: Prisma.CollaborationRequestWhereInput, limit: number) {
    return db.collaborationRequest.findMany({
      where: { deletedAt: null, project: { deletedAt: null }, ...where },
      include: requestDetailInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
    });
  },

  detail(db: Db, requestId: string) {
    return Promise.all([
      db.requestHistory.findMany({
        where: { requestId },
        include: { actorUser: { select: { name: true } }, actorAgent: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.requestComment.findMany({
        where: { requestId, deletedAt: null },
        include: { authorUser: { select: { id: true, name: true } }, authorAgent: { select: { id: true, name: true } }, attachments: { where: { deletedAt: null } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.deliverable.findMany({
        where: { requestId, deletedAt: null },
        include: { versions: { orderBy: { version: 'desc' } }, createdBy: { select: { name: true } }, createdByAgent: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.agentTask.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' } }),
      db.attachment.findMany({ where: { requestId, commentId: null, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    ]);
  },
};
