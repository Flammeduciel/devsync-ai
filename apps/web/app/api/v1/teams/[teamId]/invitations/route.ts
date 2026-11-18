import { inviteMemberSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';
import { pathId, readJson } from '@/server/http/request';

type Ctx = RouteContext<'/api/v1/teams/[teamId]/invitations'>;

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json({ items: await services().invitations.listPending(user.id, pathId(teamId, 'Team')) });
});

/** The response never contains the token: it is only sent by email. */
export const POST = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  const { tokenHash: _hash, ...invitation } = await services().invitations.invite(
    user.id,
    pathId(teamId, 'Team'),
    inviteMemberSchema.parse(await readJson(request)),
  );
  return json(invitation, 201);
});
