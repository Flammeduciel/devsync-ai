import { z } from 'zod';
import { teamRoleSchema } from './enums';
import { emailSchema, slugSchema } from './primitives';

export const createTeamSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(60),
  slug: slugSchema.optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial();
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: teamRoleSchema.default('DEVELOPER'),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({ role: teamRoleSchema });
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/** Declared areas of expertise of the current member, e.g. ["payments", "frontend", "stripe"]. */
export const memberSpecialtiesSchema = z.object({
  specialties: z
    .array(z.string().trim().min(2, 'At least 2 characters').max(48))
    .max(20, 'At most 20 specialties')
    .transform((list) =>
      list.filter((s, i) => list.findIndex((o) => o.toLowerCase() === s.toLowerCase()) === i),
    ),
});
export type MemberSpecialtiesInput = z.input<typeof memberSpecialtiesSchema>;

export const acceptInvitationSchema = z.object({ token: z.string().min(20).max(200) });
