'use server';

import {
  createTeamSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  updateTeamSchema,
  type CreateTeamInput,
  type InviteMemberInput,
  type MemberSpecialtiesInput,
  type TeamRole,
  type UpdateTeamInput,
} from '@devsync/validation';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/action-result';
import { requireUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { runAction } from '@/server/http/action';

export async function createTeamAction(
  input: CreateTeamInput,
): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const team = await services().teams.create(user.id, createTeamSchema.parse(input));
    return { slug: team.slug };
  });
}

export async function updateTeamAction(
  teamId: string,
  input: UpdateTeamInput,
): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const team = await services().teams.update(user.id, teamId, updateTeamSchema.parse(input));
    revalidatePath('/t', 'layout');
    return { slug: team.slug };
  });
}

export async function deleteTeamAction(teamId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().teams.remove(user.id, teamId);
    return undefined;
  });
}

export async function inviteMemberAction(
  teamId: string,
  input: InviteMemberInput,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().invitations.invite(user.id, teamId, inviteMemberSchema.parse(input));
    revalidatePath('/t/[teamSlug]/members', 'page');
    return undefined;
  });
}

export async function revokeInvitationAction(
  teamId: string,
  invitationId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().invitations.revoke(user.id, teamId, invitationId);
    revalidatePath('/t/[teamSlug]/members', 'page');
    return undefined;
  });
}

export async function updateMemberRoleAction(
  teamId: string,
  userId: string,
  role: TeamRole,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().members.updateRole(
      user.id,
      teamId,
      userId,
      updateMemberRoleSchema.parse({ role }),
    );
    revalidatePath('/t/[teamSlug]/members', 'page');
    return undefined;
  });
}

export async function updateMySpecialtiesAction(
  teamId: string,
  input: MemberSpecialtiesInput,
): Promise<ActionResult<{ specialties: string[] }>> {
  return runAction(async () => {
    const user = await requireUser();
    const specialties = await services().members.updateMySpecialties(user.id, teamId, input);
    revalidatePath('/t/[teamSlug]', 'layout');
    return { specialties };
  });
}

export async function removeMemberAction(teamId: string, userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await services().members.remove(user.id, teamId, userId);
    revalidatePath('/t/[teamSlug]/members', 'page');
    return undefined;
  });
}

export async function acceptInvitationAction(
  token: string,
): Promise<ActionResult<{ teamSlug: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { teamSlug } = await services().invitations.accept(user.id, token);
    return { teamSlug };
  });
}
