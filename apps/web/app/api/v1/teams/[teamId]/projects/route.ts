import { createProjectSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';
import { pathId, readJson } from '@/server/http/request';

type Ctx = RouteContext<'/api/v1/teams/[teamId]/projects'>;

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json({ items: await services().projects.list(user.id, pathId(teamId, 'Team')) });
});

export const POST = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json(await services().projects.create(user.id, pathId(teamId, 'Team'), createProjectSchema.parse(await readJson(request))), 201);
});
