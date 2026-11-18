import { updateTeamSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json, noContent } from '@/server/http/respond';
import { pathId, readJson } from '@/server/http/request';

type Ctx = RouteContext<'/api/v1/teams/[teamId]'>;

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json(await services().teams.get(user.id, pathId(teamId, 'Team')));
});

export const PATCH = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json(await services().teams.update(user.id, pathId(teamId, 'Team'), updateTeamSchema.parse(await readJson(request))));
});

export const DELETE = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  await services().teams.remove(user.id, pathId(teamId, 'Team'));
  return noContent();
});
