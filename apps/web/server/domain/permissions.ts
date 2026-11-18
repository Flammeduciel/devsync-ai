import type { ProjectRole, TeamRole } from '@devsync/validation';

/** Team-level permissions. Project-level rules live in project-access.ts. */
export const TEAM_PERMISSIONS = [
  'team:read',
  'team:update',
  'team:delete',
  'member:read',
  'member:invite',
  'member:update_role',
  'member:remove',
  'project:create',
  'project:read_all',
  'project:manage_all',
  'settings:manage',
  'audit:read',
] as const;
export type TeamPermission = (typeof TEAM_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<TeamRole, readonly TeamPermission[]> = {
  OWNER: TEAM_PERMISSIONS,
  ADMIN: TEAM_PERMISSIONS.filter((p) => p !== 'team:delete'),
  DEVELOPER: ['team:read', 'member:read', 'project:create'],
  VIEWER: ['team:read', 'member:read'],
};

const ROLE_RANK: Record<TeamRole, number> = { VIEWER: 0, DEVELOPER: 1, ADMIN: 2, OWNER: 3 };

export function hasTeamPermission(role: TeamRole, permission: TeamPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const outranks = (a: TeamRole, b: TeamRole): boolean => ROLE_RANK[a] > ROLE_RANK[b];

/** Roles an actor may grant through an invitation or a role change. Only owners create owners. */
export function canGrantRole(actor: TeamRole, role: TeamRole): boolean {
  if (!hasTeamPermission(actor, 'member:invite')) return false;
  return actor === 'OWNER' || ROLE_RANK[role] <= ROLE_RANK[actor];
}

export type MemberChangeDenial = 'FORBIDDEN' | 'LAST_OWNER' | 'SELF';

/**
 * Whether `actor` may change `target`'s role to `newRole` (or remove them when newRole is null).
 * `ownerCount` is the current number of owners in the team.
 */
export function checkMemberChange(params: {
  actorRole: TeamRole;
  actorIsTarget: boolean;
  targetRole: TeamRole;
  newRole: TeamRole | null;
  ownerCount: number;
}): MemberChangeDenial | null {
  const { actorRole, actorIsTarget, targetRole, newRole, ownerCount } = params;
  const losingOwner = targetRole === 'OWNER' && newRole !== 'OWNER';
  if (losingOwner && ownerCount <= 1) return 'LAST_OWNER';

  // Anyone may leave a team (removal of self), subject to the last-owner rule above.
  if (actorIsTarget && newRole === null) return null;
  if (actorIsTarget) return 'SELF';

  const permission = newRole === null ? 'member:remove' : 'member:update_role';
  if (!hasTeamPermission(actorRole, permission)) return 'FORBIDDEN';
  // Admins cannot touch owners or other admins; owners can touch anyone.
  if (actorRole !== 'OWNER' && !outranks(actorRole, targetRole)) return 'FORBIDDEN';
  if (newRole !== null && !canGrantRole(actorRole, newRole)) return 'FORBIDDEN';
  return null;
}

export type { ProjectRole, TeamRole };
