import { AppError } from '@devsync/shared';
import { autonomyPolicyUpdateSchema, type AutonomyPolicyUpdate } from '@devsync/validation';
import { DEFAULT_POLICY } from '../domain/autonomy';
import { recordAudit } from '../repositories/audit.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { requireTeamMember, requireTeamPermission } from './access.service';
import type { ServiceDeps } from './ports';

/** Team default autonomy policy and per-project overrides (owners/admins). */
export class AutonomyService {
  constructor(private readonly deps: ServiceDeps) {}

  async list(userId: string, teamId: string) {
    await requireTeamMember(this.deps.db, userId, teamId);
    const policies = await this.deps.db.autonomyPolicy.findMany({ where: { teamId }, include: { project: { select: { name: true } } }, orderBy: { createdAt: 'asc' } });
    const teamDefault = policies.find((p) => p.projectId === null);
    return {
      teamDefault: teamDefault ?? { ...DEFAULT_POLICY, projectId: null },
      overrides: policies.filter((p) => p.projectId !== null),
    };
  }

  async upsert(userId: string, teamId: string, rawInput: AutonomyPolicyUpdate) {
    const input = autonomyPolicyUpdateSchema.parse(rawInput);
    await requireTeamPermission(this.deps.db, userId, teamId, 'settings:manage');
    if (input.projectId) {
      const project = await projectsRepository.findActiveById(this.deps.db, input.projectId);
      if (!project || project.teamId !== teamId) throw new AppError('NOT_FOUND', 'Project not found');
    }
    const data = {
      level: input.level,
      maxRequestsPerHour: input.maxRequestsPerHour,
      maxPriority: input.maxPriority,
      maxChainDepth: input.maxChainDepth,
      allowedAgentIds: input.allowedAgentIds,
      requireApprovalActions: input.requireApprovalActions,
    };
    return this.deps.db.$transaction(async (tx) => {
      const existing = await tx.autonomyPolicy.findFirst({ where: { teamId, projectId: input.projectId } });
      const policy = existing
        ? await tx.autonomyPolicy.update({ where: { id: existing.id }, data })
        : await tx.autonomyPolicy.create({ data: { teamId, projectId: input.projectId, ...data } });
      await recordAudit(tx, { teamId, actorUserId: userId, action: 'autonomy.updated', targetType: 'autonomy_policy', targetId: policy.id, metadata: { ...data, projectId: input.projectId } });
      return policy;
    });
  }
}
