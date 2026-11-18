import { requireApiUser } from '@/server/auth/session';
import { services } from '@/server/container';
import { handler, json } from '@/server/http/respond';
import { pathId } from '@/server/http/request';

export const GET = handler(
  async (_request: Request, ctx: RouteContext<'/api/v1/teams/[teamId]/members'>) => {
    const user = await requireApiUser();
    const { teamId } = await ctx.params;
    return json({ items: await services().members.list(user.id, pathId(teamId, 'Team')) });
  },
);
