import type { Db } from '@devsync/database';
import { AppError } from '@devsync/shared';
import {
  heartbeatSchema,
  publishActivitySchema,
  registerSessionSchema,
  type AgentStatus,
  type HeartbeatInput,
  type PublishActivityInput,
  type RegisterSessionInput,
} from '@devsync/validation';
import {
  aggregateAgentStatus,
  RECONNECT_GRACE_MS,
  SESSION_STALE_AFTER_MS,
} from '../domain/agent-status';
import { hasTeamPermission } from '../domain/permissions';
import { mergeSpecialties } from '../domain/experts';
import { agentsRepository } from '../repositories/agents.repository';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { requireTeamMember } from './access.service';
import { resolveDeviceProject } from './device-project.service';
import type { DeviceActor } from './devices.service';
import { withEvents, type DraftEvent } from './events.service';
import { clock, type ServiceDeps } from './ports';

type Emit = (draft: DraftEvent) => Promise<void>;
type DisconnectReason = 'client' | 'timeout' | 'revoked' | 'server';

/**
 * Agent registry. Everything here comes from technical events sent by the Bridge (session start,
 * heartbeats, explicit declarations) — never from guesses about what an agent is thinking.
 */
export class AgentsService {
  constructor(private readonly deps: ServiceDeps) {}

  async registerSession(device: DeviceActor, rawInput: RegisterSessionInput) {
    const input = registerSessionSchema.parse(rawInput);
    const projectId =
      (
        await resolveDeviceProject(this.deps, device, {
          projectId: input.projectId,
          remote: input.repositoryRemote,
        })
      )?.projectId ?? null;
    const now = clock(this.deps);

    return withEvents(this.deps, async (tx, emit) => {
      const agent = await agentsRepository.upsertAgent(tx, {
        teamId: device.teamId,
        userId: device.userId,
        machineId: device.machineId,
        name: input.agentName,
        pluginVersion: input.pluginVersion,
        specialties: input.specialties,
      });
      const session = await agentsRepository.upsertSession(tx, {
        teamId: device.teamId,
        agentId: agent.id,
        externalSessionId: input.externalSessionId,
        projectId,
        workingDirectory: input.workingDirectory,
        branch: input.branch,
        now,
      });
      if (agent.status === 'OFFLINE') {
        await emit({
          type: 'agent.connected',
          teamId: device.teamId,
          projectId,
          actor: this.actor(device, agent.id),
          payload: {
            agentId: agent.id,
            userId: device.userId,
            sessionId: session.id,
            machineId: device.machineId,
            ...(input.pluginVersion ? { pluginVersion: input.pluginVersion } : {}),
          },
        });
      }
      await this.recordActivity(
        tx,
        emit,
        device,
        agent.id,
        session.id,
        projectId,
        'session_started',
        `Session started${input.branch ? ` on ${input.branch}` : ''}`,
        now,
      );
      await this.refreshAgentStatus(tx, emit, agent.id, now);
      return { agentId: agent.id, sessionId: session.id, projectId };
    });
  }

  async heartbeat(device: DeviceActor, sessionId: string, rawInput: HeartbeatInput) {
    const input = heartbeatSchema.parse(rawInput);
    const session = await agentsRepository.findActiveSession(
      this.deps.db,
      sessionId,
      device.machineId,
    );
    if (!session) throw new AppError('NOT_FOUND', 'Session not found or ended');
    const now = clock(this.deps);

    return withEvents(this.deps, async (tx, emit) => {
      await agentsRepository.updateSession(tx, sessionId, {
        lastHeartbeatAt: now,
        ...(input.status ? { status: input.status } : {}),
      });
      if (input.currentTask !== undefined && input.currentTask !== session.agent.currentTask) {
        await agentsRepository.updateAgent(tx, session.agentId, { currentTask: input.currentTask });
        if (input.currentTask) {
          await this.recordActivity(
            tx,
            emit,
            device,
            session.agentId,
            sessionId,
            session.projectId,
            'task_declared',
            input.currentTask,
            now,
          );
        }
      }
      const status = await this.refreshAgentStatus(tx, emit, session.agentId, now);
      return { status };
    });
  }

  async endSession(device: DeviceActor, sessionId: string) {
    const session = await agentsRepository.findActiveSession(
      this.deps.db,
      sessionId,
      device.machineId,
    );
    if (!session) throw new AppError('NOT_FOUND', 'Session not found or ended');
    await withEvents(this.deps, (tx, emit) =>
      this.closeSession(tx, emit, session, 'client', clock(this.deps)),
    );
  }

  /** Idempotent when the producer supplies `id` (Bridge retries after a lost ack). */
  async publishActivity(device: DeviceActor, rawInput: PublishActivityInput) {
    const input = publishActivitySchema.parse(rawInput);
    if (input.id && (await agentsRepository.activityExists(this.deps.db, input.id)))
      return { duplicate: true };
    const session = await agentsRepository.findActiveSession(
      this.deps.db,
      input.sessionId,
      device.machineId,
    );
    if (!session) throw new AppError('NOT_FOUND', 'Session not found or ended');
    const now = clock(this.deps);
    await withEvents(this.deps, async (tx, emit) => {
      await this.recordActivity(
        tx,
        emit,
        device,
        session.agentId,
        session.id,
        session.projectId,
        input.kind,
        input.summary,
        now,
        input.tool,
        input.id,
      );
      await agentsRepository.updateSession(tx, session.id, { lastHeartbeatAt: now });
    });
    return { duplicate: false };
  }

  /** Live Agents view. Project ids are only revealed for projects the viewer can access. */
  async listForTeam(userId: string, teamId: string) {
    const { role } = await requireTeamMember(this.deps.db, userId, teamId);
    const [agents, projects, memberSpecialties] = await Promise.all([
      agentsRepository.listForTeam(this.deps.db, teamId),
      projectsRepository.list(
        this.deps.db,
        teamId,
        hasTeamPermission(role, 'project:read_all') ? {} : { memberUserId: userId },
      ),
      membersRepository.specialtiesByUser(this.deps.db, teamId),
    ]);
    const visible = new Map(projects.map((p) => [p.id, p.name]));
    return agents
      .filter((a) => !a.machine.revokedAt)
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        kind: agent.kind,
        status: agent.status,
        currentTask: agent.currentTask,
        // What the owner declared in Settings applies to all their agents, on every machine.
        specialties: mergeSpecialties(agent.specialties, memberSpecialties.get(agent.userId)),
        pluginVersion: agent.pluginVersion,
        lastActivityAt: agent.lastActivityAt,
        user: agent.user,
        machine: { id: agent.machine.id, name: agent.machine.name },
        sessions: agent.sessions.map((s) => ({
          id: s.id,
          status: s.status,
          branch: s.branch,
          startedAt: s.startedAt,
          lastHeartbeatAt: s.lastHeartbeatAt,
          project:
            s.projectId && visible.has(s.projectId)
              ? { id: s.projectId, name: visible.get(s.projectId)! }
              : null,
        })),
      }));
  }

  /** Background job: sessions that stopped sending heartbeats are closed (status from facts, not hope). */
  async sweepStaleSessions(batchSize = 200, scope: { teamId?: string } = {}): Promise<number> {
    const now = clock(this.deps);
    const stale = await agentsRepository.staleSessions(
      this.deps.db,
      new Date(now.getTime() - SESSION_STALE_AFTER_MS),
      batchSize,
      scope.teamId,
    );
    for (const session of stale) {
      await withEvents(this.deps, (tx, emit) =>
        this.closeSession(tx, emit, session, 'timeout', now),
      );
    }
    return stale.length;
  }

  /** Background job: agents idle without any session past the grace period go OFFLINE. */
  async sweepIdleAgents(scope: { teamId?: string } = {}): Promise<number> {
    const now = clock(this.deps);
    const idle = await this.deps.db.agent.findMany({
      where: {
        ...(scope.teamId ? { teamId: scope.teamId } : {}),
        status: { not: 'OFFLINE' },
        lastActivityAt: { lt: new Date(now.getTime() - RECONNECT_GRACE_MS) },
        sessions: { none: { endedAt: null } },
      },
      select: { id: true, teamId: true, userId: true, machineId: true },
      take: 200,
    });
    for (const agent of idle) {
      await withEvents(this.deps, async (tx, emit) => {
        await this.refreshAgentStatus(tx, emit, agent.id, now);
        await emit({
          type: 'agent.disconnected',
          teamId: agent.teamId,
          actor: { type: 'SYSTEM' },
          payload: { agentId: agent.id, userId: agent.userId, reason: 'client' },
        });
      });
    }
    return idle.length;
  }

  /** Called when a machine is revoked: its sessions end immediately. */
  async disconnectMachine(machineId: string) {
    const now = clock(this.deps);
    const sessions = await agentsRepository.activeSessionsOfMachine(this.deps.db, machineId);
    for (const session of sessions) {
      await withEvents(this.deps, (tx, emit) =>
        this.closeSession(tx, emit, session, 'revoked', now),
      );
    }
  }

  private async closeSession(
    tx: Db,
    emit: Emit,
    session: {
      id: string;
      teamId: string;
      agentId: string;
      projectId: string | null;
      agent: { userId: string; machineId: string };
    },
    reason: DisconnectReason,
    now: Date,
  ) {
    const device = {
      machineId: session.agent.machineId,
      userId: session.agent.userId,
      teamId: session.teamId,
    };
    await agentsRepository.updateSession(tx, session.id, { endedAt: now, status: 'OFFLINE' });
    await this.recordActivity(
      tx,
      emit,
      device,
      session.agentId,
      session.id,
      session.projectId,
      'session_ended',
      reason === 'client' ? 'Session ended' : `Session closed (${reason})`,
      now,
    );
    // A conversation closed by the developer keeps the agent IDLE during a grace period (see sweepIdleAgents).
    const status = await this.refreshAgentStatus(tx, emit, session.agentId, now, {
      graceful: reason === 'client',
    });
    if (status === 'OFFLINE') {
      await emit({
        type: 'agent.disconnected',
        teamId: session.teamId,
        projectId: session.projectId,
        actor: reason === 'client' ? this.actor(device, session.agentId) : { type: 'SYSTEM' },
        payload: { agentId: session.agentId, userId: device.userId, sessionId: session.id, reason },
      });
    }
  }

  private async refreshAgentStatus(
    tx: Db,
    emit: Emit,
    agentId: string,
    now: Date,
    options: { graceful?: boolean } = {},
  ): Promise<AgentStatus> {
    const agent = await agentsRepository.findAgent(tx, agentId);
    if (!agent) throw new AppError('NOT_FOUND', 'Agent not found');
    const sessions = await agentsRepository.activeSessionStatuses(tx, agentId);
    const aggregated = aggregateAgentStatus(sessions.map((s) => s.status));
    const status = aggregated === 'OFFLINE' && options.graceful ? 'IDLE' : aggregated;
    await agentsRepository.updateAgent(tx, agentId, {
      status,
      lastActivityAt: now,
      ...(status === 'OFFLINE' ? { currentTask: null } : {}),
    });
    if (status !== agent.status) {
      await emit({
        type: 'agent.status.updated',
        teamId: agent.teamId,
        actor: { type: 'SYSTEM' },
        payload: { agentId, userId: agent.userId, status, previousStatus: agent.status },
      });
    }
    return status;
  }

  private async recordActivity(
    tx: Db,
    emit: Emit,
    device: DeviceActor,
    agentId: string,
    sessionId: string | null,
    projectId: string | null,
    kind: 'session_started' | 'session_ended' | 'tool_used' | 'task_declared' | 'summary_published',
    summary: string,
    now: Date,
    tool?: string,
    id?: string,
  ) {
    await agentsRepository.createActivity(tx, {
      id,
      teamId: device.teamId,
      agentId,
      sessionId,
      projectId,
      kind,
      summary,
      tool,
      occurredAt: now,
    });
    await emit({
      type: 'agent.activity.updated',
      teamId: device.teamId,
      projectId,
      actor: this.actor(device, agentId),
      payload: {
        agentId,
        userId: device.userId,
        ...(sessionId ? { sessionId } : {}),
        kind,
        summary,
        ...(tool ? { tool } : {}),
      },
    });
  }

  private actor(device: DeviceActor, agentId: string) {
    return { type: 'AGENT' as const, userId: device.userId, agentId };
  }
}
