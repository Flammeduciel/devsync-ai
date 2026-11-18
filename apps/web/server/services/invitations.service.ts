import { AppError } from '@devsync/shared';
import { inviteMemberSchema, type InviteMemberInput } from '@devsync/validation';
import {
  generateInvitationToken,
  hashToken,
  INVITATION_TTL_MS,
  invitationState,
} from '../domain/invitations';
import { canGrantRole } from '../domain/permissions';
import { recordAudit } from '../repositories/audit.repository';
import { invitationsRepository } from '../repositories/invitations.repository';
import { membersRepository } from '../repositories/members.repository';
import { usersRepository } from '../repositories/users.repository';
import { requireTeamPermission } from './access.service';
import { clock, type ServiceDeps } from './ports';

export class InvitationsService {
  constructor(private readonly deps: ServiceDeps) {}

  async listPending(userId: string, teamId: string) {
    await requireTeamPermission(this.deps.db, userId, teamId, 'member:invite');
    return invitationsRepository.listPending(this.deps.db, teamId, clock(this.deps));
  }

  /**
   * Invites an email to a team. Re-inviting the same email revokes the previous pending invitation.
   * The raw token only exists in the email; the database keeps its hash.
   */
  async invite(userId: string, teamId: string, rawInput: InviteMemberInput) {
    const input = inviteMemberSchema.parse(rawInput);
    const now = clock(this.deps);
    const { team, role: actorRole } = await requireTeamPermission(
      this.deps.db,
      userId,
      teamId,
      'member:invite',
    );
    if (!canGrantRole(actorRole, input.role)) {
      throw new AppError('FORBIDDEN', `You cannot invite someone as ${input.role.toLowerCase()}`);
    }

    const existingMember = await this.deps.db.teamMember.findFirst({
      where: { teamId, user: { email: { equals: input.email, mode: 'insensitive' } } },
    });
    if (existingMember)
      throw new AppError('CONFLICT', 'This person is already a member of the team');

    const { token, tokenHash } = generateInvitationToken();
    const inviter = await usersRepository.findActiveById(this.deps.db, userId);
    const invitation = await this.deps.db.$transaction(async (tx) => {
      await invitationsRepository.revokePendingForEmail(tx, teamId, input.email, now);
      const created = await invitationsRepository.create(tx, {
        teamId,
        email: input.email,
        role: input.role,
        tokenHash,
        invitedById: userId,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      });
      await recordAudit(tx, {
        teamId,
        actorUserId: userId,
        action: 'invitation.created',
        targetType: 'invitation',
        targetId: created.id,
        metadata: { email: input.email, role: input.role },
      });
      return created;
    });

    const link = `${this.deps.appUrl}/invitations/${encodeURIComponent(token)}`;
    await this.deps.mailer.send({
      to: input.email,
      subject: `${inviter?.name ?? 'A teammate'} invited you to ${team.name} on DevSync AI`,
      text: [
        `${inviter?.name ?? 'A teammate'} invited you to join the team "${team.name}" as ${input.role.toLowerCase()}.`,
        '',
        `Accept the invitation: ${link}`,
        '',
        'This link expires in 7 days. If you did not expect this email, you can ignore it.',
      ].join('\n'),
    });
    return invitation;
  }

  async revoke(userId: string, teamId: string, invitationId: string) {
    await requireTeamPermission(this.deps.db, userId, teamId, 'member:invite');
    const invitation = await invitationsRepository.findById(this.deps.db, teamId, invitationId);
    if (!invitation) throw new AppError('NOT_FOUND', 'Invitation not found');
    if (invitationState(invitation, clock(this.deps)) !== 'pending') {
      throw new AppError('CONFLICT', 'This invitation is no longer pending');
    }
    await this.deps.db.$transaction(async (tx) => {
      await invitationsRepository.revoke(tx, invitationId, clock(this.deps));
      await recordAudit(tx, {
        teamId,
        actorUserId: userId,
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: invitationId,
      });
    });
  }

  /** Public preview for the acceptance page. Reveals nothing for an unknown token. */
  async preview(token: string) {
    const invitation = await invitationsRepository.findByTokenHash(this.deps.db, hashToken(token));
    if (!invitation || invitation.team.deletedAt)
      throw new AppError('NOT_FOUND', 'Invitation not found');
    return {
      teamName: invitation.team.name,
      email: invitation.email,
      role: invitation.role,
      state: invitationState(invitation, clock(this.deps)),
    };
  }

  /** The signed-in user must own the invited email address. */
  async accept(userId: string, token: string) {
    const now = clock(this.deps);
    return this.deps.db.$transaction(async (tx) => {
      const invitation = await invitationsRepository.findByTokenHash(tx, hashToken(token));
      if (!invitation || invitation.team.deletedAt)
        throw new AppError('NOT_FOUND', 'Invitation not found');
      const state = invitationState(invitation, now);
      if (state !== 'pending') throw new AppError('CONFLICT', `This invitation is ${state}`);

      const user = await usersRepository.findActiveById(tx, userId);
      if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new AppError('FORBIDDEN', `This invitation was sent to ${invitation.email}`);
      }

      const existing = await membersRepository.find(tx, invitation.teamId, userId);
      if (!existing) {
        await membersRepository.create(tx, {
          teamId: invitation.teamId,
          userId,
          role: invitation.role,
        });
      }
      await invitationsRepository.markAccepted(tx, invitation.id, now);
      await recordAudit(tx, {
        teamId: invitation.teamId,
        actorUserId: userId,
        action: 'invitation.accepted',
        targetType: 'invitation',
        targetId: invitation.id,
      });
      return { teamId: invitation.teamId, teamSlug: invitation.team.slug };
    });
  }
}
