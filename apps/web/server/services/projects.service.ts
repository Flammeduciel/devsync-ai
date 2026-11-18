import { isUniqueViolation } from '@devsync/database';
import { AppError } from '@devsync/shared';
import {
  addProjectMemberSchema,
  createProjectSchema,
  createRepositorySchema,
  detectProvider,
  updateProjectSchema,
  type AddProjectMemberInput,
  type CreateProjectInput,
  type CreateRepositoryInput,
  type UpdateProjectInput,
} from '@devsync/validation';
import { hasTeamPermission } from '../domain/permissions';
import { slugify } from '../domain/slug';
import { recordAudit } from '../repositories/audit.repository';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { requireProjectAccess, requireTeamMember, requireTeamPermission } from './access.service';
import { clock, type ServiceDeps } from './ports';

export class ProjectsService {
  constructor(private readonly deps: ServiceDeps) {}

  /** Owners/admins see every project; other members only those they belong to. */
  async list(userId: string, teamId: string) {
    const { role } = await requireTeamMember(this.deps.db, userId, teamId);
    const seesAll = hasTeamPermission(role, 'project:read_all');
    return projectsRepository.list(this.deps.db, teamId, seesAll ? {} : { memberUserId: userId });
  }

  async get(userId: string, projectId: string) {
    const { project, access } = await requireProjectAccess(this.deps.db, userId, projectId, 'read');
    return { ...project, access };
  }

  /** The creator becomes MAINTAINER so a developer keeps managing the project they created. */
  async create(userId: string, teamId: string, rawInput: CreateProjectInput) {
    const input = createProjectSchema.parse(rawInput);
    await requireTeamPermission(this.deps.db, userId, teamId, 'project:create');
    const slug = input.slug ?? slugify(input.name);
    try {
      return await this.deps.db.$transaction(async (tx) => {
        const project = await projectsRepository.create(tx, {
          teamId,
          name: input.name,
          slug,
          description: input.description,
          createdById: userId,
        });
        await projectsRepository.upsertMember(tx, { teamId, projectId: project.id, userId, role: 'MAINTAINER' });
        await recordAudit(tx, { teamId, actorUserId: userId, action: 'project.created', targetType: 'project', targetId: project.id });
        return project;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'slug')) throw new AppError('CONFLICT', `A project with the URL "${slug}" already exists`);
      throw error;
    }
  }

  async update(userId: string, projectId: string, rawInput: UpdateProjectInput) {
    const input = updateProjectSchema.parse(rawInput);
    const { project } = await requireProjectAccess(this.deps.db, userId, projectId, 'manage');
    try {
      return await this.deps.db.$transaction(async (tx) => {
        const updated = await projectsRepository.update(tx, projectId, input);
        await recordAudit(tx, { teamId: project.teamId, actorUserId: userId, action: 'project.updated', targetType: 'project', targetId: projectId, metadata: input });
        return updated;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'slug')) throw new AppError('CONFLICT', `A project with the URL "${input.slug}" already exists`);
      throw error;
    }
  }

  async remove(userId: string, projectId: string) {
    const { project } = await requireProjectAccess(this.deps.db, userId, projectId, 'manage');
    await this.deps.db.$transaction(async (tx) => {
      await projectsRepository.softDelete(tx, projectId, clock(this.deps));
      await recordAudit(tx, { teamId: project.teamId, actorUserId: userId, action: 'project.deleted', targetType: 'project', targetId: projectId });
    });
  }

  async listMembers(userId: string, projectId: string) {
    await requireProjectAccess(this.deps.db, userId, projectId, 'read');
    const members = await projectsRepository.listMembers(this.deps.db, projectId);
    return members.map((m) => ({ ...m.user, role: m.role }));
  }

  /** Only members of the project's team can be added. */
  async addMember(userId: string, projectId: string, rawInput: AddProjectMemberInput) {
    const input = addProjectMemberSchema.parse(rawInput);
    const { project } = await requireProjectAccess(this.deps.db, userId, projectId, 'manage');
    const teamMember = await membersRepository.find(this.deps.db, project.teamId, input.userId);
    if (!teamMember) throw new AppError('BAD_REQUEST', 'This user is not a member of the team');
    return this.deps.db.$transaction(async (tx) => {
      const member = await projectsRepository.upsertMember(tx, { teamId: project.teamId, projectId, userId: input.userId, role: input.role });
      await recordAudit(tx, { teamId: project.teamId, actorUserId: userId, action: 'project.member_set', targetType: 'project', targetId: projectId, metadata: { userId: input.userId, role: input.role } });
      return member;
    });
  }

  async removeMember(userId: string, projectId: string, memberUserId: string) {
    const { project } = await requireProjectAccess(this.deps.db, userId, projectId, 'manage');
    await this.deps.db.$transaction(async (tx) => {
      const { count } = await projectsRepository.removeMember(tx, projectId, memberUserId);
      if (count === 0) throw new AppError('NOT_FOUND', 'Member not found');
      await recordAudit(tx, { teamId: project.teamId, actorUserId: userId, action: 'project.member_removed', targetType: 'project', targetId: projectId, metadata: { userId: memberUserId } });
    });
  }

  async listRepositories(userId: string, projectId: string) {
    await requireProjectAccess(this.deps.db, userId, projectId, 'read');
    return projectsRepository.listRepositories(this.deps.db, projectId);
  }

  async addRepository(userId: string, projectId: string, rawInput: CreateRepositoryInput) {
    const input = createRepositorySchema.parse(rawInput);
    const { project } = await requireProjectAccess(this.deps.db, userId, projectId, 'manage');
    try {
      return await this.deps.db.$transaction(async (tx) => {
        const repository = await projectsRepository.createRepository(tx, {
          teamId: project.teamId,
          projectId,
          remoteUrl: input.remoteUrl,
          name: input.name ?? input.remoteUrl.split('/').pop()!,
          provider: detectProvider(input.remoteUrl),
          defaultBranch: input.defaultBranch,
        });
        await recordAudit(tx, { teamId: project.teamId, actorUserId: userId, action: 'repository.added', targetType: 'repository', targetId: repository.id, metadata: { remoteUrl: input.remoteUrl } });
        return repository;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'This repository is already linked to the project');
      throw error;
    }
  }

  async removeRepository(userId: string, projectId: string, repositoryId: string) {
    const { project } = await requireProjectAccess(this.deps.db, userId, projectId, 'manage');
    const repository = await projectsRepository.findRepository(this.deps.db, projectId, repositoryId);
    if (!repository) throw new AppError('NOT_FOUND', 'Repository not found');
    await this.deps.db.$transaction(async (tx) => {
      await projectsRepository.softDeleteRepository(tx, repositoryId, clock(this.deps));
      await recordAudit(tx, { teamId: project.teamId, actorUserId: userId, action: 'repository.removed', targetType: 'repository', targetId: repositoryId });
    });
  }
}
