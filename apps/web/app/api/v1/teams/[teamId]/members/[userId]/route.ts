import { updateMemberRoleSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json, noContent } from '@/server/http/respond';
import { pathId, readJson } from '@/server/http/request';

type Ctx = RouteContext<'/api/v1/teams/[teamId]/members/[userId]'>;

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId, userId } = await ctx.params;
  const member = await services().members.updateRole(
    user.id,
    pathId(teamId, 'Team'),
    pathId(userId, 'Member'),
    updateMemberRoleSchema.parse(await readJson(request)),
  );
  return json(member);
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId, userId } = await ctx.params;
  await services().members.remove(user.id, pathId(teamId, 'Team'), pathId(userId, 'Member'));
  return noContent();
});
