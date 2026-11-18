import { AppError } from '@devsync/shared';
import {
  updateMemberRoleSchema,
  type TeamRole,
  type UpdateMemberRoleInput,
} from '@devsync/validation';
import { checkMemberChange } from '../domain/permissions';
import { recordAudit } from '../repositories/audit.repository';
import { membersRepository } from '../repositories/members.repository';
import { requireTeamMember } from './access.service';
import type { ServiceDeps } from './ports';

const DENIAL_MESSAGES = {
  FORBIDDEN: 'You do not have permission to change this member',
  LAST_OWNER: 'A team must keep at least one owner',
  SELF: 'You cannot change your own role',
} as const;

export class MembersService {
  constructor(private readonly deps: ServiceDeps) {}

  async list(userId: string, teamId: string) {
    await requireTeamMember(this.deps.db, userId, teamId);
    const members = await membersRepository.list(this.deps.db, teamId);
    return members.map((m) => ({ ...m.user, role: m.role, joinedAt: m.joinedAt }));
  }

  async updateRole(
    actorId: string,
    teamId: string,
    targetUserId: string,
    rawInput: UpdateMemberRoleInput,
  ) {
    const { role } = updateMemberRoleSchema.parse(rawInput);
    return this.change(actorId, teamId, targetUserId, role);
  }

  async remove(actorId: string, teamId: string, targetUserId: string) {
    await this.change(actorId, teamId, targetUserId, null);
  }

  private async change(
    actorId: string,
    teamId: string,
    targetUserId: string,
    newRole: TeamRole | null,
  ) {
    return this.deps.db.$transaction(
      async (tx) => {
        const { role: actorRole } = await requireTeamMember(tx, actorId, teamId);
        const target = await membersRepository.find(tx, teamId, targetUserId);
        if (!target) throw new AppError('NOT_FOUND', 'Member not found');

        const denial = checkMemberChange({
          actorRole,
          actorIsTarget: actorId === targetUserId,
          targetRole: target.role,
          newRole,
          ownerCount: await membersRepository.countOwners(tx, teamId),
        });
        if (denial) {
          throw new AppError(
            denial === 'LAST_OWNER' ? 'CONFLICT' : 'FORBIDDEN',
            DENIAL_MESSAGES[denial],
          );
        }

        const base = { teamId, actorUserId: actorId, targetType: 'member', targetId: targetUserId };
        if (newRole === null) {
          await membersRepository.remove(tx, teamId, targetUserId);
          await recordAudit(tx, {
            ...base,
            action: 'member.removed',
            metadata: { role: target.role },
          });
          return null;
        }
        const updated = await membersRepository.updateRole(tx, teamId, targetUserId, newRole);
        await recordAudit(tx, {
          ...base,
          action: 'member.role_changed',
          metadata: { from: target.role, to: newRole },
        });
        return updated;
      },
      { isolationLevel: 'Serializable' },
    ); // two owners demoting each other must not leave zero owners
  }
}
