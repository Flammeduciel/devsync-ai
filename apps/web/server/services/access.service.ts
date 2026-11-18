import type { Db } from '@devsync/database';
import { AppError } from '@devsync/shared';
import { hasTeamPermission, type TeamPermission } from '../domain/permissions';
import { hasProjectAccess, projectAccess, type ProjectAccess } from '../domain/project-access';
import { membersRepository } from '../repositories/members.repository';
import { projectsRepository } from '../repositories/projects.repository';
import { teamsRepository } from '../repositories/teams.repository';

/**
 * Authorization gate used by every service. Resources outside the caller's teams are reported
 * as NOT_FOUND (never FORBIDDEN) so their existence does not leak across tenants.
 */
export async function requireTeamMember(db: Db, userId: string, teamId: string) {
  const [team, membership] = await Promise.all([
    teamsRepository.findActiveById(db, teamId),
    membersRepository.find(db, teamId, userId),
  ]);
  if (!team || !membership) throw new AppError('NOT_FOUND', 'Team not found');
  return { team, membership, role: membership.role };
}

export async function requireTeamPermission(db: Db, userId: string, teamId: string, permission: TeamPermission) {
  const access = await requireTeamMember(db, userId, teamId);
  if (!hasTeamPermission(access.role, permission)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to perform this action');
  }
  return access;
}

export async function requireProjectAccess(
  db: Db,
  userId: string,
  projectId: string,
  required: Exclude<ProjectAccess, 'none'>,
) {
  const project = await projectsRepository.findActiveById(db, projectId);
  if (!project) throw new AppError('NOT_FOUND', 'Project not found');
  const [membership, projectMember] = await Promise.all([
    membersRepository.find(db, project.teamId, userId),
    projectsRepository.findProjectMember(db, projectId, userId),
  ]);
  if (!membership) throw new AppError('NOT_FOUND', 'Project not found');
  const access = projectAccess(membership.role, projectMember?.role ?? null);
  if (access === 'none') throw new AppError('NOT_FOUND', 'Project not found');
  if (!hasProjectAccess(access, required)) {
    throw new AppError('FORBIDDEN', 'You do not have permission to perform this action');
  }
  return { project, teamRole: membership.role, access };
}
