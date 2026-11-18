import type { Db, NotificationKind, Prisma, RequestStatus } from '@devsync/database';
import { AppError } from '@devsync/shared';
import {
  commentSchema,
  createRequestSchema,
  listRequestsSchema,
  requestActionSchema,
  type CommentInput,
  type CreateRequestInput,
  type ListRequestsInput,
  type RequestActionInput,
} from '@devsync/validation';
import { DEFAULT_POLICY, evaluateAgentRequest, type AutonomyPolicyRules } from '../domain/autonomy';
import { hasTeamPermission } from '../domain/permissions';
import { hasProjectAccess, projectAccess, type ProjectAccess } from '../domain/project-access';
import { availableActions, checkTransition, requestFingerprint, TRANSITIONS, type RequestAction, type RequestRole } from '../domain/requests';
import { recordAudit } from '../repositories/audit.repository';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { requestsRepository } from '../repositories/requests.repository';
import { tasksRepository } from '../repositories/tasks.repository';
import { actorAgentId, actorRef, type Actor } from './actor';
import { resolveDeviceProject } from './device-project.service';
import { withEvents, type DraftEvent } from './events.service';
import { notify } from './notifications.service';
import { clock, type ServiceDeps } from './ports';
import { transitionTask } from './tasks.service';

type Emit = (draft: DraftEvent) => Promise<void>;
type RequestRow = NonNullable<Awaited<ReturnType<typeof requestsRepository.findActive>>>;

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const DENIALS = {
  INVALID_STATE: ['CONFLICT', 'This action is not possible in the current status'],
  NOT_ALLOWED: ['FORBIDDEN', 'You are not allowed to perform this action on this request'],
  AWAITING_APPROVAL: ['CONFLICT', 'This request is waiting for a developer approval'],
  ALREADY_APPROVED: ['CONFLICT', 'This request is already approved'],
} as const;

const NOTIFY_ON: Partial<Record<RequestAction, { to: 'creator' | 'assignee'; kind: NotificationKind; verb: string }>> = {
  approve: { to: 'assignee', kind: 'REQUEST_CREATED', verb: 'New request' },
  accept: { to: 'creator', kind: 'REQUEST_ACCEPTED', verb: 'Accepted' },
  reject: { to: 'creator', kind: 'REQUEST_REJECTED', verb: 'Rejected' },
  start: { to: 'creator', kind: 'REQUEST_IN_PROGRESS', verb: 'In progress' },
  clarify: { to: 'creator', kind: 'REQUEST_CLARIFICATION', verb: 'Question about' },
  answer: { to: 'assignee', kind: 'REQUEST_CLARIFICATION', verb: 'Answer about' },
  complete: { to: 'creator', kind: 'REQUEST_IN_PROGRESS', verb: 'Completed' },
  cancel: { to: 'assignee', kind: 'REQUEST_REJECTED', verb: 'Cancelled' },
};

/**
 * Collaboration requests between developers and agents: creation under autonomy rules, the status
 * lifecycle, history, comments, and the AgentTask that carries the work once accepted.
 */
export class RequestsService {
  constructor(private readonly deps: ServiceDeps) {}

  /**
   * `device` is set for agents (project may be resolved from the Git remote); humans pass projectId.
   */
  async create(actor: Actor, rawInput: CreateRequestInput, device?: { teamId: string; machineId: string; userId: string }) {
    const input = createRequestSchema.parse(rawInput);
    const db = this.deps.db;
    const now = clock(this.deps);

    // Project and the creator's write access.
    let projectId: string;
    if (device) {
      const resolved = await resolveDeviceProject(this.deps, device, input);
      if (!resolved) throw new AppError('NOT_FOUND', 'No project matches this repository; pass projectId');
      if (!hasProjectAccess(resolved.access, 'write')) throw new AppError('FORBIDDEN', 'Read-only access to this project');
      projectId = resolved.projectId;
    } else {
      if (!input.projectId) throw new AppError('VALIDATION_FAILED', 'projectId is required');
      projectId = input.projectId;
      if (!hasProjectAccess(await this.projectAccessOf(actor.userId, projectId), 'write')) throw new AppError('NOT_FOUND', 'Project not found');
    }
    const project = await projectsRepository.findActiveById(db, projectId);
    if (!project) throw new AppError('NOT_FOUND', 'Project not found');
    const teamId = project.teamId;

    // Assignee: an agent (its owner becomes the assignee user) or a developer, with write access.
    let assigneeUserId = input.assigneeUserId ?? null;
    const assigneeAgentId = input.assigneeAgentId ?? null;
    if (assigneeAgentId) {
      const agent = await db.agent.findFirst({ where: { id: assigneeAgentId, teamId, machine: { revokedAt: null } }, select: { userId: true } });
      if (!agent) throw new AppError('NOT_FOUND', 'Assignee agent not found');
      if (assigneeUserId && assigneeUserId !== agent.userId) throw new AppError('BAD_REQUEST', 'assigneeUserId does not own assigneeAgentId');
      assigneeUserId = agent.userId;
    }
    if (!assigneeUserId) throw new AppError('VALIDATION_FAILED', 'An assignee is required');
    if (assigneeUserId === actor.userId) throw new AppError('BAD_REQUEST', 'You cannot send a request to yourself or your own agents');
    if (!hasProjectAccess(await this.projectAccessOf(assigneeUserId, projectId), 'write')) {
      throw new AppError('BAD_REQUEST', 'The assignee has no write access to this project');
    }

    // Request chains (loop prevention).
    let depth = 0;
    let chainInitiators: string[] = [];
    if (input.parentRequestId) {
      const chain = await requestsRepository.chain(db, input.parentRequestId);
      if (!chain || chain.teamId !== teamId) throw new AppError('NOT_FOUND', 'Parent request not found');
      depth = chain.depth + 1;
      chainInitiators = chain.initiators;
    }

    const fingerprint = requestFingerprint({ projectId, type: input.type, assigneeUserId, assigneeAgentId, title: input.title });
    const duplicate = await requestsRepository.findOpenByFingerprint(db, teamId, fingerprint, new Date(now.getTime() - DEDUPE_WINDOW_MS));
    if (duplicate) throw new AppError('CONFLICT', 'The same request is already open', { requestId: duplicate.id, status: duplicate.status });

    // Autonomy rules apply to agents only.
    let requiresApproval = input.suggestOnly;
    let approvalReason: string | null = input.suggestOnly ? 'Suggested by an agent' : null;
    if (actor.type === 'AGENT') {
      const decision = evaluateAgentRequest(await this.policyFor(teamId, projectId), {
        priority: input.priority,
        assigneeAgentId,
        depth,
        createdByAgentLastHour: await requestsRepository.countByAgentSince(db, actor.agentId, new Date(now.getTime() - 3_600_000)),
        chainInitiatorAgentIds: chainInitiators,
      });
      if (decision.outcome === 'deny') throw new AppError(decision.code, decision.reason);
      if (decision.outcome === 'needs_approval') {
        requiresApproval = true;
        approvalReason = decision.reason;
      }
    } else if (input.suggestOnly) {
      requiresApproval = false; // a human creating a request is the approval
      approvalReason = null;
    }

    if (input.dependentTaskId) {
      const task = await tasksRepository.findById(db, teamId, input.dependentTaskId);
      if (!task || task.projectId !== projectId || task.assigneeUserId !== actor.userId) throw new AppError('NOT_FOUND', 'Dependent task not found');
    }

    return withEvents(this.deps, async (tx, emit) => {
      const request = await requestsRepository.create(tx, {
        teamId,
        projectId,
        type: input.type,
        priority: input.priority,
        origin: actor.type,
        createdByUserId: actor.userId,
        initiatorAgentId: actorAgentId(actor),
        assigneeUserId,
        assigneeAgentId,
        title: input.title,
        description: input.description,
        instructions: input.instructions ?? null,
        expectedDeliverables: input.expectedDeliverables as Prisma.InputJsonValue,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        requiresApproval,
        parentRequestId: input.parentRequestId ?? null,
        depth,
        fingerprint,
      });
      await requestsRepository.addHistory(tx, {
        teamId,
        requestId: request.id,
        actorType: actor.type,
        actorUserId: actor.userId,
        actorAgentId: actorAgentId(actor),
        action: 'created',
        toStatus: 'PENDING',
        data: { ...(approvalReason ? { approvalReason } : {}), ...(input.dependentTaskId ? { dependentTaskId: input.dependentTaskId } : {}) },
      });
      if (actor.type === 'AGENT') {
        await recordAudit(tx, { teamId, actorUserId: actor.userId, actorAgentId: actor.agentId, action: 'request.created_by_agent', targetType: 'request', targetId: request.id, metadata: { requiresApproval } });
      }
      await this.emitRequest(emit, 'collaboration.request.created', request, actor);
      if (requiresApproval) {
        await notify(tx, emit, {
          teamId,
          userId: actor.userId,
          kind: 'REQUEST_CREATED',
          title: `Approve your agent's request: ${request.title}`,
          body: approvalReason ?? undefined,
          link: this.link(request),
          dedupeKey: `request-approval:${request.id}`,
        });
      } else {
        await this.notifyParty(tx, emit, request, 'assignee', 'REQUEST_CREATED', `New request: ${request.title}`, `created:${request.id}`, request.description.slice(0, 200));
      }
      return this.present(request, actor, await this.rolesOf(actor, request));
    });
  }

  async act(actor: Actor, requestId: string, rawInput: RequestActionInput) {
    const input = requestActionSchema.parse(rawInput);
    const request = await this.requireVisible(actor, requestId);
    const roles = await this.rolesOf(actor, request);
    const awaitingApproval = request.requiresApproval && !request.approvedAt;
    const denial = checkTransition({ action: input.action, status: request.status, roles, awaitingApproval });
    if (denial) throw new AppError(DENIALS[denial][0], DENIALS[denial][1]);
    const now = clock(this.deps);

    return withEvents(this.deps, async (tx, emit) => {
      const to: RequestStatus = TRANSITIONS[input.action].to ?? (await requestsRepository.statusBeforeClarification(tx, request.id)) ?? 'PENDING';
      const data: Prisma.CollaborationRequestUncheckedUpdateInput = { status: to };
      if (input.action === 'approve') Object.assign(data, { approvedByUserId: actor.userId, approvedAt: now });
      if (['reject', 'cancel'].includes(input.action)) data.closedAt = now;

      // The task that carries the work follows the request.
      let task = await tasksRepository.findForRequest(tx, request.id);
      if ((input.action === 'accept' || input.action === 'start') && !task) {
        task = await tasksRepository.create(tx, {
          teamId: request.teamId,
          projectId: request.projectId,
          requestId: request.id,
          title: request.title,
          description: request.description,
          assigneeUserId: request.assigneeUserId,
          assigneeAgentId: request.assigneeAgentId,
        });
        const created = await requestsRepository.createdHistoryData(tx, request.id);
        const dependentTaskId = (created?.data as { dependentTaskId?: string } | null)?.dependentTaskId;
        if (dependentTaskId) {
          await tasksRepository.addDependency(tx, { teamId: request.teamId, projectId: request.projectId, dependentTaskId, blockingTaskId: task.id, description: `Waiting for request "${request.title}"` });
        }
      }
      if (task) {
        const taskStatus = { start: 'IN_PROGRESS', complete: 'DONE', reject: 'CANCELLED', cancel: 'CANCELLED' } as const;
        const next = taskStatus[input.action as keyof typeof taskStatus];
        if (next) await transitionTask(tx, emit, task, next, now);
      }

      const updated = await requestsRepository.update(tx, request.id, data);
      await requestsRepository.addHistory(tx, {
        teamId: request.teamId,
        requestId: request.id,
        actorType: actor.type,
        actorUserId: actor.userId,
        actorAgentId: actorAgentId(actor),
        action: input.action === 'approve' ? 'approved' : input.action,
        fromStatus: request.status,
        toStatus: to,
        data: input.comment ? { comment: input.comment } : {},
      });
      if (input.comment) {
        await tx.requestComment.create({
          data: { teamId: request.teamId, requestId: request.id, authorType: actor.type, authorUserId: actor.userId, authorAgentId: actorAgentId(actor), body: input.comment },
        });
      }

      const eventType = input.action === 'accept' ? 'collaboration.request.accepted' : input.action === 'reject' ? 'collaboration.request.rejected' : 'collaboration.request.updated';
      await this.emitRequest(emit, eventType, updated, actor, { changes: ['status'], ...(input.action === 'reject' && input.comment ? { reason: input.comment } : {}) });

      const rule = NOTIFY_ON[input.action];
      if (rule) {
        await this.notifyParty(tx, emit, updated, rule.to, rule.kind, `${rule.verb}: ${request.title}`, `${input.action}:${request.id}:${now.getTime()}`, input.comment?.slice(0, 200));
      }
      return this.present(updated, actor, await this.rolesOf(actor, updated));
    });
  }

  async comment(actor: Actor, requestId: string, rawInput: CommentInput) {
    const { body } = commentSchema.parse(rawInput);
    const request = await this.requireVisible(actor, requestId);
    const roles = await this.rolesOf(actor, request);
    if (roles.length === 0) throw new AppError('FORBIDDEN', 'Only the people involved can comment');
    return withEvents(this.deps, async (tx, emit) => {
      const comment = await tx.requestComment.create({
        data: { teamId: request.teamId, requestId, authorType: actor.type, authorUserId: actor.userId, authorAgentId: actorAgentId(actor), body },
      });
      await requestsRepository.addHistory(tx, { teamId: request.teamId, requestId, actorType: actor.type, actorUserId: actor.userId, actorAgentId: actorAgentId(actor), action: 'commented' });
      await this.emitRequest(emit, 'collaboration.request.updated', request, actor, { changes: ['comment'] });
      return comment;
    });
  }

  async get(actor: Actor, requestId: string) {
    const request = await this.requireVisible(actor, requestId);
    const [history, comments, deliverables, tasks, attachments] = await requestsRepository.detail(this.deps.db, requestId);
    return {
      ...this.present(request, actor, await this.rolesOf(actor, request)),
      history: history.map((h) => ({ at: h.createdAt, action: h.action, fromStatus: h.fromStatus, toStatus: h.toStatus, by: h.actorAgent ? `${h.actorUser?.name ?? '?'} (agent ${h.actorAgent.name})` : (h.actorUser?.name ?? 'System'), data: h.data })),
      comments: comments.map((c) => ({ id: c.id, at: c.createdAt, body: c.body, author: c.authorAgent ? `${c.authorUser?.name ?? '?'} (agent ${c.authorAgent.name})` : (c.authorUser?.name ?? 'System'), attachments: c.attachments.map((a) => ({ id: a.id, fileName: a.fileName, sizeBytes: Number(a.sizeBytes) })) })),
      deliverables: deliverables.map((d) => ({
        id: d.id,
        title: d.title,
        format: d.format,
        status: d.status,
        currentVersion: d.currentVersion,
        publishedAt: d.publishedAt,
        by: d.createdByAgent ? `${d.createdBy.name} (agent ${d.createdByAgent.name})` : d.createdBy.name,
        versions: d.versions.map((v) => ({ version: v.version, contentType: v.contentType, sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes), url: v.url, gitRef: v.gitRef, notes: v.notes, createdAt: v.createdAt })),
      })),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
      attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, contentType: a.contentType, sizeBytes: Number(a.sizeBytes) })),
    };
  }

  /** Requests of the team visible to the user (projects they can read), optionally only theirs. */
  async list(userId: string, teamId: string, rawInput: ListRequestsInput) {
    const input = listRequestsSchema.parse(rawInput);
    const membership = await membersRepository.find(this.deps.db, teamId, userId);
    if (!membership) throw new AppError('NOT_FOUND', 'Team not found');
    const projects = await projectsRepository.list(this.deps.db, teamId, hasTeamPermission(membership.role, 'project:read_all') ? {} : { memberUserId: userId });
    const visible = projects.map((p) => p.id).filter((id) => !input.projectId || id === input.projectId);
    const rows = await requestsRepository.list(
      this.deps.db,
      {
        teamId,
        projectId: { in: visible },
        ...(input.status?.length ? { status: { in: input.status } } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.scope === 'created' ? { createdByUserId: userId } : {}),
        ...(input.scope === 'assigned' ? { assigneeUserId: userId, OR: [{ requiresApproval: false }, { approvedAt: { not: null } }] } : {}),
      },
      input.limit,
    );
    const actor: Actor = { type: 'HUMAN', userId };
    return Promise.all(rows.map(async (r) => this.present(r, actor, await this.rolesOf(actor, r))));
  }

  // ── helpers ──

  private async projectAccessOf(userId: string, projectId: string): Promise<ProjectAccess> {
    const project = await projectsRepository.findActiveById(this.deps.db, projectId);
    if (!project) return 'none';
    const membership = await membersRepository.find(this.deps.db, project.teamId, userId);
    if (!membership) return 'none';
    const member = await projectsRepository.findProjectMember(this.deps.db, projectId, userId);
    return projectAccess(membership.role, member?.role ?? null);
  }

  private async policyFor(teamId: string, projectId: string): Promise<AutonomyPolicyRules> {
    const policies = await this.deps.db.autonomyPolicy.findMany({ where: { teamId, OR: [{ projectId }, { projectId: null }] } });
    const policy = policies.find((p) => p.projectId === projectId) ?? policies.find((p) => p.projectId === null);
    return policy ?? DEFAULT_POLICY;
  }

  /** NOT_FOUND unless the actor can read the project (or is a party to the request). */
  private async requireVisible(actor: Actor, requestId: string): Promise<RequestRow> {
    const request = await requestsRepository.findActive(this.deps.db, requestId);
    if (!request) throw new AppError('NOT_FOUND', 'Request not found');
    if (actor.type === 'AGENT' && actor.teamId !== request.teamId) throw new AppError('NOT_FOUND', 'Request not found');
    const isParty = request.createdByUserId === actor.userId || request.assigneeUserId === actor.userId;
    if (!isParty && (await this.projectAccessOf(actor.userId, request.projectId)) === 'none') throw new AppError('NOT_FOUND', 'Request not found');
    if (!(await membersRepository.find(this.deps.db, request.teamId, actor.userId))) throw new AppError('NOT_FOUND', 'Request not found');
    return request;
  }

  private async rolesOf(actor: Actor, request: Pick<RequestRow, 'createdByUserId' | 'assigneeUserId' | 'projectId'>): Promise<RequestRole[]> {
    const roles: RequestRole[] = [];
    if (request.createdByUserId === actor.userId) roles.push('creator');
    if (request.assigneeUserId === actor.userId) roles.push('assignee');
    if ((await this.projectAccessOf(actor.userId, request.projectId)) === 'manage') roles.push('manager');
    return roles;
  }

  private present(request: RequestRow, actor: Actor, roles: RequestRole[]) {
    const awaitingApproval = request.requiresApproval && !request.approvedAt;
    return {
      id: request.id,
      type: request.type,
      status: request.status,
      priority: request.priority,
      origin: request.origin,
      title: request.title,
      description: request.description,
      instructions: request.instructions,
      expectedDeliverables: request.expectedDeliverables,
      dueAt: request.dueAt,
      project: { id: request.project.id, name: request.project.name },
      createdBy: request.createdBy,
      initiatorAgent: request.initiatorAgent,
      assigneeUser: request.assigneeUser,
      assigneeAgent: request.assigneeAgent,
      awaitingApproval,
      approvedBy: request.approvedBy,
      parentRequestId: request.parentRequestId,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      yourRoles: roles,
      availableActions: availableActions(request.status, roles, awaitingApproval),
    };
  }

  private link(request: Pick<RequestRow, 'id'>) {
    return `/requests/${request.id}`;
  }

  private async notifyParty(tx: Db, emit: Emit, request: RequestRow, to: 'creator' | 'assignee', kind: NotificationKind, title: string, dedupeKey: string, body?: string) {
    const userId = to === 'creator' ? request.createdByUserId : request.assigneeUserId;
    if (!userId) return;
    await notify(tx, emit, { teamId: request.teamId, userId, kind, title, ...(body ? { body } : {}), link: this.link(request), dedupeKey, data: { requestId: request.id } });
  }

  private async emitRequest(
    emit: Emit,
    type: 'collaboration.request.created' | 'collaboration.request.accepted' | 'collaboration.request.updated' | 'collaboration.request.rejected',
    request: RequestRow,
    actor: Actor,
    extra: { changes?: string[]; reason?: string } = {},
  ) {
    const payload = {
      requestId: request.id,
      title: request.title,
      type: request.type,
      status: request.status,
      priority: request.priority,
      requesterUserId: request.createdByUserId,
      ...(request.assigneeUserId ? { assigneeUserId: request.assigneeUserId } : {}),
      ...(request.assigneeAgentId ? { assigneeAgentId: request.assigneeAgentId } : {}),
      ...(type === 'collaboration.request.updated' ? { changes: extra.changes ?? [] } : {}),
      ...(type === 'collaboration.request.rejected' && extra.reason ? { reason: extra.reason } : {}),
    };
    await emit({
      type,
      teamId: request.teamId,
      projectId: request.projectId,
      actor: actorRef(actor),
      // Only the parties receive request events (titles may be confidential to the project).
      audience: [...new Set([request.createdByUserId, request.assigneeUserId].filter((u): u is string => !!u))],
      payload: payload as never,
    });
  }
}
