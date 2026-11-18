import { requireTeamMember } from './access.service';
import type { ServiceDeps } from './ports';

const OPEN_STATUSES = ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_FOR_CLARIFICATION'] as const;

/** Requests waiting for a developer or one of their agents (used by `devsync inbox` and the dashboard). */
export class InboxService {
  constructor(private readonly deps: ServiceDeps) {}

  async forUser(userId: string, teamId: string, limit = 25) {
    await requireTeamMember(this.deps.db, userId, teamId);
    const agents = await this.deps.db.agent.findMany({
      where: { teamId, userId },
      select: { id: true },
    });
    const requests = await this.deps.db.collaborationRequest.findMany({
      where: {
        teamId,
        deletedAt: null,
        status: { in: [...OPEN_STATUSES] },
        // Level-1 (suggest-only) requests reach the assignee only once a human approved them.
        OR: [{ requiresApproval: false }, { approvedAt: { not: null } }],
        AND: [
          {
            OR: [{ assigneeUserId: userId }, { assigneeAgentId: { in: agents.map((a) => a.id) } }],
          },
        ],
        project: { deletedAt: null },
      },
      select: {
        id: true,
        type: true,
        status: true,
        priority: true,
        title: true,
        dueAt: true,
        createdAt: true,
        origin: true,
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        initiatorAgent: { select: { id: true, name: true } },
        assigneeAgentId: true,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: limit,
    });
    return requests;
  }

  /** Requests the user created that were delivered in the last 7 days, with their deliverables. */
  async deliveredToUser(userId: string, teamId: string, limit = 10) {
    await requireTeamMember(this.deps.db, userId, teamId);
    const requests = await this.deps.db.collaborationRequest.findMany({
      where: {
        teamId,
        createdByUserId: userId,
        status: 'DELIVERED',
        deletedAt: null,
        updatedAt: { gt: new Date(Date.now() - 7 * 86_400_000) },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        project: { select: { id: true, name: true } },
        assigneeUser: { select: { name: true } },
        deliverables: {
          where: { status: 'PUBLISHED', deletedAt: null },
          select: { id: true, title: true, format: true, currentVersion: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return requests;
  }
}
