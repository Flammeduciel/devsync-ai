import type { Db, TaskStatus } from '@devsync/database';
import { AppError } from '@devsync/shared';
import { addDependencySchema, createTaskSchema, updateTaskSchema, type CreateTaskInput } from '@devsync/validation';
import type { z } from 'zod';
import { hasProjectAccess } from '../domain/project-access';
import { projectAccess } from '../domain/project-access';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { tasksRepository } from '../repositories/tasks.repository';
import type { Actor } from './actor';
import { resolveDeviceProject } from './device-project.service';
import type { DeviceActor } from './devices.service';
import { withEvents, type DraftEvent } from './events.service';
import { notify } from './notifications.service';
import { clock, type ServiceDeps } from './ports';

type Emit = (draft: DraftEvent) => Promise<void>;

/**
 * Sets a task status inside the caller's transaction. Finishing a task resolves the dependencies it
 * was blocking and tells the people waiting for them.
 */
export async function transitionTask(tx: Db, emit: Emit, task: { id: string; teamId: string; title: string }, status: TaskStatus, now: Date) {
  await tasksRepository.setStatus(tx, task.id, status, now);
  if (status !== 'DONE') return;
  for (const dep of await tasksRepository.openDependenciesBlockedBy(tx, task.id)) {
    await tasksRepository.resolveDependency(tx, dep.id, now);
    if (dep.dependentTask.assigneeUserId) {
      await notify(tx, emit, {
        teamId: task.teamId,
        userId: dep.dependentTask.assigneeUserId,
        kind: 'DEPENDENCY_RESOLVED',
        title: `Unblocked: ${dep.dependentTask.title}`,
        body: `"${task.title}" is done.`,
        dedupeKey: `dependency-resolved:${dep.id}`,
      });
    }
  }
}

export class TasksService {
  constructor(private readonly deps: ServiceDeps) {}

  /** A self-declared task (an agent records what it works on, so others can depend on it). */
  async create(device: DeviceActor, actor: Actor, rawInput: CreateTaskInput) {
    const input = createTaskSchema.parse(rawInput);
    const resolved = await resolveDeviceProject(this.deps, device, input);
    if (!resolved) throw new AppError('NOT_FOUND', 'No project matches this repository; pass projectId');
    if (!hasProjectAccess(resolved.access, 'write')) throw new AppError('FORBIDDEN', 'Read-only access to this project');
    return tasksRepository.create(this.deps.db, {
      teamId: device.teamId,
      projectId: resolved.projectId,
      title: input.title,
      description: input.description ?? null,
      assigneeUserId: actor.userId,
      assigneeAgentId: actor.type === 'AGENT' ? actor.agentId : null,
    });
  }

  async updateStatus(actor: Actor, teamId: string, taskId: string, rawInput: z.input<typeof updateTaskSchema>) {
    const { status } = updateTaskSchema.parse(rawInput);
    const task = await this.requireOwnTask(actor, teamId, taskId);
    await withEvents(this.deps, (tx, emit) => transitionTask(tx, emit, task, status, clock(this.deps)));
    return { id: task.id, status };
  }

  /** "My task cannot finish before that one": both tasks must be in the same project. */
  async addDependency(actor: Actor, teamId: string, taskId: string, rawInput: z.input<typeof addDependencySchema>) {
    const input = addDependencySchema.parse(rawInput);
    const task = await this.requireOwnTask(actor, teamId, taskId);
    const blocking = await tasksRepository.findById(this.deps.db, teamId, input.blockingTaskId);
    if (!blocking || blocking.projectId !== task.projectId) throw new AppError('NOT_FOUND', 'Blocking task not found in this project');
    if (blocking.id === task.id) throw new AppError('BAD_REQUEST', 'A task cannot depend on itself');
    return tasksRepository.addDependency(this.deps.db, { teamId, projectId: task.projectId, dependentTaskId: task.id, blockingTaskId: blocking.id, description: input.description });
  }

  /** Dependency graph around a task or the tasks of a request. */
  async dependencies(actor: Actor, teamId: string, ref: { taskId?: string; requestId?: string }) {
    const tasks = ref.taskId
      ? [await tasksRepository.findById(this.deps.db, teamId, ref.taskId)].filter((t) => t !== null)
      : await this.deps.db.agentTask.findMany({ where: { teamId, requestId: ref.requestId ?? '' } });
    if (tasks.length === 0) throw new AppError('NOT_FOUND', 'Task not found');
    await this.requireProjectRead(actor, teamId, tasks[0]!.projectId);
    const edges = await tasksRepository.graph(this.deps.db, tasks.map((t) => t.id));
    return {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, requestId: t.requestId })),
      blockedBy: edges.filter((e) => tasks.some((t) => t.id === e.dependentTaskId)).map((e) => ({ status: e.status, task: e.blockingTask })),
      blocking: edges.filter((e) => tasks.some((t) => t.id === e.blockingTaskId)).map((e) => ({ status: e.status, task: e.dependentTask })),
    };
  }

  private async requireOwnTask(actor: Actor, teamId: string, taskId: string) {
    const task = await tasksRepository.findById(this.deps.db, teamId, taskId);
    if (!task) throw new AppError('NOT_FOUND', 'Task not found');
    await this.requireProjectRead(actor, teamId, task.projectId);
    if (task.assigneeUserId !== actor.userId) throw new AppError('FORBIDDEN', 'Only the assignee can change this task');
    return task;
  }

  private async requireProjectRead(actor: Actor, teamId: string, projectId: string) {
    const membership = await membersRepository.find(this.deps.db, teamId, actor.userId);
    const member = await projectsRepository.findProjectMember(this.deps.db, projectId, actor.userId);
    if (!membership || projectAccess(membership.role, member?.role ?? null) === 'none') throw new AppError('NOT_FOUND', 'Task not found');
  }
}
