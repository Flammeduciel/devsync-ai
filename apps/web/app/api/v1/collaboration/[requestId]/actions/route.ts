import { requestActionSchema } from '@devsync/validation';
import { requireActor } from '@/server/auth/actor';
import { services } from '@/server/container';
import { pathId, readJson } from '@/server/http/request';
import { handler, json } from '@/server/http/respond';

/** approve | accept | reject | start | clarify | answer | complete | cancel */
export const POST = handler(async (request: Request, ctx: RouteContext<'/api/v1/collaboration/[requestId]/actions'>) => {
  const { actor } = await requireActor(request);
  const { requestId } = await ctx.params;
  return json(await services().requests.act(actor, pathId(requestId, 'Request'), requestActionSchema.parse(await readJson(request))));
});
