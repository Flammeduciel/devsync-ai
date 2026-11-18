import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { pathId } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const GET = handler(async (_request: Request, ctx: RouteContext<'/api/v1/teams/[teamId]/machines'>) => {
  const user = await requireApiUser();
  const { teamId } = await ctx.params;
  return json({ items: await services().devices.list(user.id, pathId(teamId, 'Team')) });
});
