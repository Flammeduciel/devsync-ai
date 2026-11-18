import type { ProjectRole, TeamRole } from '@devsync/validation';
import { hasTeamPermission } from './permissions';

export type ProjectAccess = 'none' | 'read' | 'write' | 'manage';

/**
 * Effective access to a project. Team owners/admins manage every project; other members need
 * an explicit project membership. Team viewers are read-only whatever their project role.
 */
export function projectAccess(teamRole: TeamRole, projectRole: ProjectRole | null): ProjectAccess {
  if (hasTeamPermission(teamRole, 'project:manage_all')) return 'manage';
  if (projectRole === null) return 'none';
  if (teamRole === 'VIEWER' || projectRole === 'VIEWER') return 'read';
  return projectRole === 'MAINTAINER' ? 'manage' : 'write';
}

const ORDER: Record<ProjectAccess, number> = { none: 0, read: 1, write: 2, manage: 3 };

export const hasProjectAccess = (actual: ProjectAccess, required: Exclude<ProjectAccess, 'none'>): boolean =>
  ORDER[actual] >= ORDER[required];
