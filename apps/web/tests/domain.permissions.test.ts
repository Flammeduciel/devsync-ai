import { describe, expect, it } from 'vitest';
import { canGrantRole, checkMemberChange, hasTeamPermission, type TeamRole } from '../server/domain/permissions';
import { hasProjectAccess, projectAccess } from '../server/domain/project-access';

const roles: TeamRole[] = ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'];

describe('team permissions', () => {
  it('only owners can delete a team', () => {
    expect(roles.filter((r) => hasTeamPermission(r, 'team:delete'))).toEqual(['OWNER']);
  });
  it('owners and admins can invite, developers and viewers cannot', () => {
    expect(roles.filter((r) => hasTeamPermission(r, 'member:invite'))).toEqual(['OWNER', 'ADMIN']);
  });
  it('developers can create projects, viewers cannot', () => {
    expect(hasTeamPermission('DEVELOPER', 'project:create')).toBe(true);
    expect(hasTeamPermission('VIEWER', 'project:create')).toBe(false);
  });
  it('only owners grant the owner role', () => {
    expect(canGrantRole('OWNER', 'OWNER')).toBe(true);
    expect(canGrantRole('ADMIN', 'OWNER')).toBe(false);
    expect(canGrantRole('ADMIN', 'ADMIN')).toBe(true);
    expect(canGrantRole('DEVELOPER', 'VIEWER')).toBe(false);
  });
});

describe('checkMemberChange', () => {
  const base = { actorIsTarget: false, ownerCount: 2 };
  it('protects the last owner', () => {
    expect(checkMemberChange({ ...base, actorRole: 'OWNER', targetRole: 'OWNER', newRole: 'ADMIN', ownerCount: 1 })).toBe('LAST_OWNER');
    expect(checkMemberChange({ ...base, actorRole: 'OWNER', actorIsTarget: true, targetRole: 'OWNER', newRole: null, ownerCount: 1 })).toBe('LAST_OWNER');
  });
  it('lets members leave but not change their own role', () => {
    expect(checkMemberChange({ ...base, actorRole: 'VIEWER', actorIsTarget: true, targetRole: 'VIEWER', newRole: null })).toBeNull();
    expect(checkMemberChange({ ...base, actorRole: 'ADMIN', actorIsTarget: true, targetRole: 'ADMIN', newRole: 'OWNER' })).toBe('SELF');
  });
  it('prevents admins from touching owners or peers', () => {
    expect(checkMemberChange({ ...base, actorRole: 'ADMIN', targetRole: 'OWNER', newRole: 'DEVELOPER' })).toBe('FORBIDDEN');
    expect(checkMemberChange({ ...base, actorRole: 'ADMIN', targetRole: 'ADMIN', newRole: null })).toBe('FORBIDDEN');
    expect(checkMemberChange({ ...base, actorRole: 'ADMIN', targetRole: 'DEVELOPER', newRole: 'VIEWER' })).toBeNull();
  });
  it('prevents developers from managing members', () => {
    expect(checkMemberChange({ ...base, actorRole: 'DEVELOPER', targetRole: 'VIEWER', newRole: null })).toBe('FORBIDDEN');
  });
  it('lets owners demote other owners when another owner remains', () => {
    expect(checkMemberChange({ ...base, actorRole: 'OWNER', targetRole: 'OWNER', newRole: 'ADMIN' })).toBeNull();
  });
});

describe('projectAccess', () => {
  it('gives owners/admins manage access everywhere', () => {
    expect(projectAccess('OWNER', null)).toBe('manage');
    expect(projectAccess('ADMIN', null)).toBe('manage');
  });
  it('requires membership for developers and viewers', () => {
    expect(projectAccess('DEVELOPER', null)).toBe('none');
    expect(projectAccess('VIEWER', null)).toBe('none');
  });
  it('maps project roles and caps team viewers at read', () => {
    expect(projectAccess('DEVELOPER', 'MAINTAINER')).toBe('manage');
    expect(projectAccess('DEVELOPER', 'CONTRIBUTOR')).toBe('write');
    expect(projectAccess('DEVELOPER', 'VIEWER')).toBe('read');
    expect(projectAccess('VIEWER', 'MAINTAINER')).toBe('read');
    expect(hasProjectAccess('write', 'read')).toBe(true);
    expect(hasProjectAccess('read', 'write')).toBe(false);
  });
});
