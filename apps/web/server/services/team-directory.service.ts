import { AppError } from '@devsync/shared';
import {
  activityQuerySchema,
  agentSearchSchema,
  contextQuerySchema,
  expertQuerySchema,
  type ActivityQuery,
  type AgentSearchInput,
  type ContextQuery,
  type ExpertQuery,
} from '@devsync/validation';
import { scoreExpert, topicTokens } from '../domain/experts';
import { hasTeamPermission } from '../domain/permissions';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import type { AgentsService } from './agents.service';
import type { ClaimsService } from './claims.service';
import { resolveDeviceProject } from './device-project.service';
import type { DeviceActor } from './devices.service';
import type { InboxService } from './inbox.service';
import type { ServiceDeps } from './ports';

/**
 * Read model used by agents (MCP tools, SessionStart hook): who is working on what, recent activity,
 * who knows a topic, which resources are claimed. Everything is scoped to what the device owner may see.
 */
export class TeamDirectoryService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly agents: AgentsService,
    private readonly inbox: InboxService,
    private readonly claims: ClaimsService,
  ) {}

  async context(device: DeviceActor, rawInput: ContextQuery) {
    const input = contextQuerySchema.parse(rawInput);
    const resolved = await resolveDeviceProject(this.deps, device, input);
    const [team, project, agents, inbox, activity] = await Promise.all([
      this.deps.db.team.findUniqueOrThrow({
        where: { id: device.teamId },
        select: { id: true, name: true, slug: true },
      }),
      resolved
        ? this.deps.db.project.findUniqueOrThrow({
            where: { id: resolved.projectId },
            select: {
              id: true,
              name: true,
              description: true,
              repositories: {
                where: { deletedAt: null },
                select: { name: true, remoteUrl: true, defaultBranch: true },
              },
            },
          })
        : null,
      this.agents.listForTeam(device.userId, device.teamId),
      this.inbox.forUser(device.userId, device.teamId, 10),
      this.activity(device, { ...input, limit: 10 }),
    ]);
    return {
      team,
      project: project ? { ...project, access: resolved!.access } : null,
      teammates: agents
        .filter((a) => a.status !== 'OFFLINE' && a.machine.id !== device.machineId)
        .map((a) => ({
          agentId: a.id,
          owner: a.user.name,
          agentName: a.name,
          status: a.status,
          currentTask: a.currentTask,
          specialties: a.specialties,
          projects: [...new Set(a.sessions.map((s) => s.project?.name).filter(Boolean))],
          branches: [...new Set(a.sessions.map((s) => s.branch).filter(Boolean))],
        })),
      inbox,
      claims: project ? await this.claims.listActive(project.id) : [],
      recentActivity: activity,
    };
  }

  async searchAgents(device: DeviceActor, rawInput: AgentSearchInput) {
    const input = agentSearchSchema.parse(rawInput);
    const resolved =
      input.projectId || input.remote ? await resolveDeviceProject(this.deps, device, input) : null;
    const query = input.query?.toLowerCase();
    const agents = await this.agents.listForTeam(device.userId, device.teamId);
    return agents.filter((a) => {
      if (!input.includeOffline && a.status === 'OFFLINE') return false;
      if (input.status?.length && !input.status.includes(a.status)) return false;
      if (resolved && !a.sessions.some((s) => s.project?.id === resolved.projectId)) return false;
      if (!query) return true;
      return [a.name, a.user.name, a.currentTask ?? '', ...a.specialties].some((v) =>
        v.toLowerCase().includes(query),
      );
    });
  }

  async activity(device: DeviceActor, rawInput: ActivityQuery) {
    const input = activityQuerySchema.parse(rawInput);
    const resolved =
      input.projectId || input.remote ? await resolveDeviceProject(this.deps, device, input) : null;
    const visibleProjects = await this.visibleProjectIds(device);
    const rows = await this.deps.db.agentActivity.findMany({
      where: {
        teamId: device.teamId,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.since ? { occurredAt: { gt: new Date(input.since) } } : {}),
        // Activity of projects the owner cannot see is never returned.
        ...(resolved
          ? { projectId: resolved.projectId }
          : { OR: [{ projectId: null }, { projectId: { in: visibleProjects } }] }),
      },
      include: {
        agent: { select: { name: true, user: { select: { name: true } } } },
        project: { select: { name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: input.limit,
    });
    return rows.map((r) => ({
      at: r.occurredAt,
      who: `${r.agent.user.name} (${r.agent.name})`,
      kind: r.kind,
      summary: r.summary,
      tool: r.tool,
      project: r.project?.name ?? null,
    }));
  }

  async findExperts(device: DeviceActor, rawInput: ExpertQuery) {
    const input = expertQuerySchema.parse(rawInput);
    const tokens = topicTokens(input.topic);
    if (tokens.length === 0)
      throw new AppError('VALIDATION_FAILED', 'The topic has no meaningful words');
    const agents = await this.searchAgents(device, {
      projectId: input.projectId,
      remote: input.remote,
      includeOffline: true,
    });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const summaries = await this.deps.db.agentActivity.findMany({
      where: {
        teamId: device.teamId,
        agentId: { in: agents.map((a) => a.id) },
        occurredAt: { gt: since },
        kind: { in: ['tool_used', 'task_declared', 'summary_published'] },
      },
      select: { agentId: true, summary: true },
      take: 2000,
      orderBy: { occurredAt: 'desc' },
    });
    return agents
      .filter((a) => a.machine.id !== device.machineId)
      .map((a) => ({
        agentId: a.id,
        owner: a.user.name,
        agentName: a.name,
        status: a.status,
        currentTask: a.currentTask,
        ...scoreExpert(tokens, {
          specialties: a.specialties,
          currentTask: a.currentTask,
          recentSummaries: summaries.filter((s) => s.agentId === a.id).map((s) => s.summary),
        }),
      }))
      .filter((e) => e.score > 0)
      .sort(
        (x, y) =>
          y.score - x.score || Number(x.status === 'OFFLINE') - Number(y.status === 'OFFLINE'),
      )
      .slice(0, input.limit);
  }

  private async visibleProjectIds(device: DeviceActor): Promise<string[]> {
    const membership = await membersRepository.find(this.deps.db, device.teamId, device.userId);
    if (!membership) return [];
    const projects = await projectsRepository.list(
      this.deps.db,
      device.teamId,
      hasTeamPermission(membership.role, 'project:read_all') ? {} : { memberUserId: device.userId },
    );
    return projects.map((p) => p.id);
  }
}
