import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

export const GET = handler(async (request: Request, ctx: RouteContext<'/api/v1/collaboration/[requestId]'>) => {
  const { actor } = await requireActor(request);
  const { requestId } = await ctx.params;
  return json(await services().requests.get(actor, pathId(requestId, 'Request')));
});
