import { requireActor, teamOf } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readQuery } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const GET = handler(
  async (request: Request, ctx: RouteContext<'/api/v1/collaboration/[requestId]/dependencies'>) => {
    const resolved = await requireActor(request);
    const { requestId } = await ctx.params;
    const query = readQuery(request);
    const teamId = teamOf(resolved, typeof query.teamId === 'string' ? query.teamId : null);
    return json(
      await services().tasks.dependencies(resolved.actor, teamId, {
        requestId: pathId(requestId, 'Request'),
      }),
    );
  },
);
