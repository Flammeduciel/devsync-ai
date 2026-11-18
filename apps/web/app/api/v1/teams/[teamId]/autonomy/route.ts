import { autonomyPolicyUpdateSchema } from '@devsync/validation';
import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

type Ctx = RouteContext<'/api/v1/teams/[teamId]/autonomy'>;

export const GET = handler(async (_request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json(await services().autonomy.list(user.id, pathId(teamId, 'Team')));
});

/** Owners/admins: set the team default (projectId null) or a project override. */
export const PUT = handler(async (request: Request, ctx: Ctx) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json(
    await services().autonomy.upsert(
      user.id,
      pathId(teamId, 'Team'),
      autonomyPolicyUpdateSchema.parse(await readJson(request)),
    ),
  );
});
